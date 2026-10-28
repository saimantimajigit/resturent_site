import {NextResponse} from 'next/server';

export function sameOriginRequest(request:Request):boolean{
 const origin=request.headers.get('origin');
 if(!origin)return false;
 try{return new URL(origin).origin===new URL(request.url).origin}
 catch{return false}
}

export function rejectCrossOrigin(request:Request){
 return sameOriginRequest(request)?null:NextResponse.json({error:{code:'ORIGIN_REJECTED',message:'Invalid request origin'}},{status:403});
}
