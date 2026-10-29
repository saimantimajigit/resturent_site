import 'server-only';
import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {staffContext} from './staff-context';
import {AuthenticationError,AuthorizationError} from './session';

export async function managerContext(){return staffContext(['MANAGER','OWNER'])}

export function adminError(error:unknown,message='Could not complete the management request.'){
  if(error instanceof AuthenticationError)return NextResponse.json({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},{status:401});
  if(error instanceof AuthorizationError)return NextResponse.json({error:{code:'FORBIDDEN',message:'Manager access required.'}},{status:403});
  if(error instanceof ZodError)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Review the submitted management fields.'}},{status:400});
  if(error instanceof Error&&error.message.startsWith('ADMIN_CONFLICT:'))return NextResponse.json({error:{code:'CONFLICT',message:error.message.slice(15)}},{status:409});
  if(error instanceof Error&&error.message.startsWith('ADMIN_NOT_FOUND:'))return NextResponse.json({error:{code:'NOT_FOUND',message:error.message.slice('ADMIN_NOT_FOUND:'.length)}},{status:404});
  if(error&&typeof error==='object'&&'code'in error&&(error as {code?:string}).code==='P2002')return NextResponse.json({error:{code:'CONFLICT',message:'A record with those unique values already exists.'}},{status:409});
  if(error&&typeof error==='object'&&'code'in error&&(error as {code?:string}).code==='P2034')return NextResponse.json({error:{code:'CONCURRENT_CHANGE',message:'Another management change completed first. Refresh and try again.'}},{status:409});
  console.error('restaurant administration request failed',error);
  return NextResponse.json({error:{code:'INTERNAL_ERROR',message}},{status:500});
}
