"use strict";

export default function comparePoints(p1: { row: number; column: number }, p2: { row: number; column: number }) {
    return p1.row - p2.row || p1.column - p2.column;
};