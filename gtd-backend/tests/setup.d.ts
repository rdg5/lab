declare global {
    namespace jest {
        interface Matchers<R> {
            toBeValidGTDTask(): R;
            toHaveValidOutcome(): R;
            toHaveValidNextAction(): R;
        }
    }
}
export {};
//# sourceMappingURL=setup.d.ts.map