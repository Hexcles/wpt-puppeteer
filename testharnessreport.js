/* global add_completion_callback */
/* global setup */

/*
 * This file is intended for vendors to implement code needed to integrate
 * testharness.js tests with their own test systems.
 *
 * Typically test system integration will attach callbacks when each test has
 * run, using add_result_callback(callback(test)), or when the whole test file
 * has completed, using
 * add_completion_callback(callback(tests, harness_status)).
 *
 * For more documentation about the callback functions and the
 * parameters they are called with see testharness.js
 */

(function() {

function dump_test_results(tests, status) {
    let report = {
        status: status.status,
        message: status.message || undefined,
        subtests: tests.map(t => {
            return {
                name: t.name,
                status: t.status,
                message: t.message || undefined,
            }
        }),
    };
    console.trace(JSON.stringify(report));
}

add_completion_callback(dump_test_results);

})();