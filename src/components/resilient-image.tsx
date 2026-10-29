'use client';

import {useState} from 'react';

type ResilientImageProps={
  src:string;
  alt:string;
  className?:string;
  loading?:'eager'|'lazy';
  sizes?:string;
};

/** Keeps remote and local image failures inside a branded, accessible image frame. */
export default function ResilientImage({src,alt,className,loading='lazy',sizes}:ResilientImageProps){
  const [failed,setFailed]=useState(false);
  if(failed||!src){
    return <div className={`image-fallback${className?` ${className}`:''}`} {...(alt?{role:'img' as const,'aria-label':alt}:{'aria-hidden':true})}>
      <span className="image-fallback-mark" aria-hidden="true">S</span>
      <span className="image-fallback-label" aria-hidden="true">Image temporarily unavailable</span>
    </div>;
  }
  return <img className={className} src={src} alt={alt} loading={loading} sizes={sizes} onError={()=>setFailed(true)}/>;
}
