export function applyMixins(derivedCtor, baseCtors) {
    baseCtors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            derivedCtor.prototype[name] = baseCtor.prototype[name];
        });
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWl4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibWl4LnRzIl0sIm5hbWVzIjpbImFwcGx5TWl4aW5zIl0sIm1hcHBpbmdzIjoiQUFHQSw0QkFBNEIsV0FBZ0IsRUFBRSxTQUFnQjtJQUMxREEsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUE7UUFDdEJBLE1BQU1BLENBQUNBLG1CQUFtQkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUE7WUFDdkRBLFdBQVdBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQzNEQSxDQUFDQSxDQUFDQSxDQUFBQTtJQUNOQSxDQUFDQSxDQUFDQSxDQUFDQTtBQUNQQSxDQUFDQSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogU2VlIFR5cGVTY3JpcHQgTWl4aW5zIGRvY3VtZW50YXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcHBseU1peGlucyhkZXJpdmVkQ3RvcjogYW55LCBiYXNlQ3RvcnM6IGFueVtdKSB7XG4gICAgYmFzZUN0b3JzLmZvckVhY2goYmFzZUN0b3IgPT4ge1xuICAgICAgICBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhiYXNlQ3Rvci5wcm90b3R5cGUpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICAgICAgICBkZXJpdmVkQ3Rvci5wcm90b3R5cGVbbmFtZV0gPSBiYXNlQ3Rvci5wcm90b3R5cGVbbmFtZV07XG4gICAgICAgIH0pXG4gICAgfSk7XG59XG4iXX0=