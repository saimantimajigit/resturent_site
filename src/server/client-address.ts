import {isIP} from 'node:net';

const trustedProxyHeaders=new Set(['x-real-ip','cf-connecting-ip','true-client-ip']);

export function rateLimitAddress(request:Request,config:{production?:boolean;trustedHeader?:string}={}){
  const production=config.production??process.env.NODE_ENV==='production';
  const trustedHeader=config.trustedHeader?.trim().toLowerCase()||'';
  if(production){
    // Trust only a single-value header that the public ingress overwrites.
    // Without that guarantee, caller-supplied forwarding headers are not identities.
    if(!trustedProxyHeaders.has(trustedHeader))return 'trusted-proxy-unconfigured';
    const value=request.headers.get(trustedHeader)?.trim()||'';
    return isIP(value)?value.toLowerCase():'unknown';
  }
  const value=request.headers.get('x-real-ip')?.trim()||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'';
  return isIP(value)?value.toLowerCase():'unknown';
}
