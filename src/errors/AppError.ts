export type AppErrorCode='unsupported-file'|'password-protected'|'invalid-pdf'|'import-failed'|'export-failed';
export class AppError extends Error{constructor(public readonly code:AppErrorCode,message:string){super(message);this.name='AppError'}}
export const friendlyError=(e:unknown)=>e instanceof AppError?e.message:'Something went wrong. Your workspace is still here.';
