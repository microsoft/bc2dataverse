export function sorter<T>(getString: (x: T) => string): (a: T, b: T) => number {
    return (a, b) => getString(a) > getString(b) ? 1 : -1;
}


