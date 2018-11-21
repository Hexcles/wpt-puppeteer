/* global add_completion_callback, _wptrunner_finish */

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
    let test_results = tests.map(function(x) {
        return {name:x.name, status:x.status, message:x.message, stack:x.stack}
    });
    let data = {subtests:test_results,
                status: status.status,
                message: status.message,
                stack: status.stack};
    console.log(data);
    _wptrunner_finish(data);
}

add_completion_callback(dump_test_results);

})();
