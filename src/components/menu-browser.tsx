'use client';

import {useMemo,useState} from 'react';

export type MenuDish={id:string;slug:string;name:string;description:string|null;category:string;price:number|null;currency:string;vegetarian:boolean;available:boolean;allergens:string[];image:string|null};
const photos=[
 'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=1000&q=85',
 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=1000&q=85',
 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1000&q=85',
];

export default function MenuBrowser({dishes,categories}:{dishes:MenuDish[];categories:{id:string;name:string}[]}){
 const [query,setQuery]=useState('');const [category,setCategory]=useState('all');const [vegetarian,setVegetarian]=useState(false);
 const shown=useMemo(()=>dishes.filter(dish=>{
  const matchesQuery=`${dish.name} ${dish.description??''} ${dish.allergens.join(' ')}`.toLowerCase().includes(query.toLowerCase());
  return matchesQuery&&(category==='all'||dish.category===category)&&(!vegetarian||dish.vegetarian);
 }),[dishes,query,category,vegetarian]);
 return <>
  <nav className="category-nav" aria-label="Menu categories"><button className="filter-chip" aria-pressed={category==='all'} onClick={()=>setCategory('all')}>All dishes</button>{categories.map(item=><button className="filter-chip" key={item.id} aria-pressed={category===item.name} onClick={()=>setCategory(item.name)}>{item.name}</button>)}</nav>
  <div className="menu-toolbar"><label className="sr-only" htmlFor="menu-search">Search the menu</label><input id="menu-search" className="menu-search" type="search" placeholder="Search dishes or allergens" value={query} onChange={event=>setQuery(event.target.value)}/><label className="filter-chip filter-toggle"><input type="checkbox" checked={vegetarian} onChange={event=>setVegetarian(event.target.checked)}/> Vegetarian</label></div>
  {shown.length?<div className="dish-grid">{shown.map((dish,index)=><article className="dish-card" key={dish.id}><a className="dish-image" href={`/menu/${dish.slug}`}><img src={dish.image||photos[index%photos.length]} alt={`A plated serving of ${dish.name}`} loading="lazy"/><span className={`availability-tag ${dish.available?'':'unavailable'}`}>{dish.available?'Available':'Currently unavailable'}</span></a><div className="dish-card-body"><span className="dish-category">{dish.category}</span><h2 className="dish-title"><a href={`/menu/${dish.slug}`}>{dish.name}</a></h2><p>{dish.description||'Prepared with seasonal ingredients.'}</p><div className="dietary-badges">{dish.vegetarian?<span className="badge">Vegetarian</span>:null}{dish.allergens.slice(0,2).map(allergen=><span className="badge allergen-badge" key={allergen}>{allergen}</span>)}</div><div className="dish-meta"><span>{dish.price===null?'Price on request':`₹${(dish.price/100).toLocaleString('en-IN',{minimumFractionDigits:2})}`}</span><a href={`/menu/${dish.slug}`}>Details ↗</a></div></div></article>)}</div>:<div className="empty-state"><h2>Nothing on this page just yet.</h2><p>Try another search or category, or come back to the menu soon.</p></div>}
  <p className="allergen-note">Please let our team know about allergies before ordering. Our kitchen handles all listed allergens.</p>
 </>;
}
