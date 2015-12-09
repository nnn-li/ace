/**
 * Converts a module name + .extension into an URL path.
 * *Requires* the use of a module name. It does not support using
 * plain URLs like nameToUrl.
 */
export function toUrl(moduleNamePlusExt) {
    var ext,
        index = moduleNamePlusExt.lastIndexOf('.'),
        segment = moduleNamePlusExt.split('/')[0],
        isRelative = segment === '.' || segment === '..';

    //Have a file extension alias, and it is not the
    //dots from a relative path.
    if (index !== -1 && (!isRelative || index > 1)) {
        ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
        moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
    }

    return context.nameToUrl(normalize(moduleNamePlusExt,
                            relMap && relMap.id, true), ext,  true);
}
/**
 * Trims the . and .. from an array of path segments.
 * It will keep a leading path segment if a .. will become
 * the first path segment, to help with module name lookups,
 * which act like paths, but can be remapped. But the end result,
 * all paths that use this function should look normalized.
 * NOTE: this method MODIFIES the input array.
 * @param {Array} ary the array of path segments.
 */
function trimDots(ary) {
    var i, part;
    for (i = 0; i < ary.length; i++) {
        part = ary[i];
        if (part === '.') {
            ary.splice(i, 1);
            i -= 1;
        } else if (part === '..') {
            // If at the start, or previous value is still ..,
            // keep them so that when converted to a path it may
            // still work when converted to a path, even though
            // as an ID it is less than ideal. In larger point
            // releases, may be better to just kick out an error.
            if (i === 0 || (i === 1 && ary[2] === '..') || ary[i - 1] === '..') {
                continue;
            } else if (i > 0) {
                ary.splice(i - 1, 2);
                i -= 2;
            }
        }
    }
}

/**
 * Given a relative module name, like ./something, normalize it to
 * a real name that can be mapped to a path.
 * @param {String} name the relative name
 * @param {String} baseName a real name that the name arg is relative
 * to.
 * @param {Boolean} applyMap apply the map config to the value. Should
 * only be done if this normalization is for a dependency ID.
 * @returns {String} normalized name
 */
function normalize(name, baseName, applyMap) {
    var pkgMain, mapValue, nameParts, i, j, nameSegment, lastIndex,
        foundMap, foundI, foundStarMap, starI, normalizedBaseParts,
        baseParts = (baseName && baseName.split('/')),
        map = config.map,
        starMap = map && map['*'];

    //Adjust any relative paths.
    if (name) {
        name = name.split('/');
        lastIndex = name.length - 1;

        // If wanting node ID compatibility, strip .js from end
        // of IDs. Have to do this here, and not in nameToUrl
        // because node allows either .js or non .js to map
        // to same file.
        if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
            name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
        }

        // Starts with a '.' so need the baseName
        if (name[0].charAt(0) === '.' && baseParts) {
            //Convert baseName to array, and lop off the last part,
            //so that . matches that 'directory' and not name of the baseName's
            //module. For instance, baseName of 'one/two/three', maps to
            //'one/two/three.js', but we want the directory, 'one/two' for
            //this normalization.
            normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
            name = normalizedBaseParts.concat(name);
        }

        trimDots(name);
        name = name.join('/');
    }

    //Apply map config if available.
    if (applyMap && map && (baseParts || starMap)) {
        nameParts = name.split('/');

        outerLoop: for (i = nameParts.length; i > 0; i -= 1) {
            nameSegment = nameParts.slice(0, i).join('/');

            if (baseParts) {
                //Find the longest baseName segment match in the config.
                //So, do joins on the biggest to smallest lengths of baseParts.
                for (j = baseParts.length; j > 0; j -= 1) {
                    mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                    //baseName segment has config, find if it has one for
                    //this name.
                    if (mapValue) {
                        mapValue = getOwn(mapValue, nameSegment);
                        if (mapValue) {
                            //Match, update name to the new value.
                            foundMap = mapValue;
                            foundI = i;
                            break outerLoop;
                        }
                    }
                }
            }

            //Check for a star map match, but just hold on to it,
            //if there is a shorter segment match later in a matching
            //config, then favor over this star map.
            if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                foundStarMap = getOwn(starMap, nameSegment);
                starI = i;
            }
        }

        if (!foundMap && foundStarMap) {
            foundMap = foundStarMap;
            foundI = starI;
        }

        if (foundMap) {
            nameParts.splice(0, foundI, foundMap);
            name = nameParts.join('/');
        }
    }

    // If the name points to a package's name, use
    // the package main instead.
    pkgMain = getOwn(config.pkgs, name);

    return pkgMain ? pkgMain : name;
}