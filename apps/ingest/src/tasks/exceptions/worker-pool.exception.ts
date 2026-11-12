/** The pool can't run the task: it was closed, or one of its workers crashed (a bug). */
export class WorkerPoolException extends Error {}
