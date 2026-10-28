'use client';
import {useRouter} from 'next/navigation';
import type {MenuDish} from './menu-browser';

export default function OrderMenu({dishes}:{dishes:MenuDish[]}){
 const router=useRouter();
 return <div className="dish-grid">{dishes.map(dish=><article className="dish-card" key={dish.id}><img className="dish-image" src={dish.image||'/images/savore-dining-room.png'} alt={`A plated serving of ${dish.name}`}/><div className="dish-card-body"><span className="dish-category">{dish.category}</span><h2 className="dish-title">{dish.name}</h2><p>{dish.description}</p><p>{dish.allergens.length?`Allergens: ${dish.allergens.join(', ')}`:'Please tell us about any allergies at checkout.'}</p><strong>{dish.price===null?'Price on request':`₹${(dish.price/100).toLocaleString('en-IN',{minimumFractionDigits:2})}`}</strong><p><button className="button button-forest" disabled={!dish.available||dish.price===null} onClick={()=>{const key='savore-cart-v1';const cart=JSON.parse(localStorage.getItem(key)||'[]') as {menuItemId:string;name:string;quantity:number}[];const line=cart.find(item=>item.menuItemId===dish.id);if(line)line.quantity=Math.min(20,line.quantity+1);else cart.push({menuItemId:dish.id,name:dish.name,quantity:1});localStorage.setItem(key,JSON.stringify(cart));localStorage.removeItem('savore-checkout-key');router.push('/cart')}}>Add to order</button></p></div></article>)}</div>;
}
