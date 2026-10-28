const links=[
 {href:'/menu',label:'Menu'},
 {href:'/order-online',label:'Order online'},
 {href:'/experiences/chef-tasting',label:'Experiences'},
 {href:'/our-story',label:'Our story'},
 {href:'/gallery',label:'Gallery'},
 {href:'/contact',label:'Contact'},
];

export default function SiteHeader(){
 return <header className="site-header">
  <a className="wordmark" href="/" aria-label="SAVORÉ home">SAVORÉ<span>·</span></a>
  <nav className="desktop-nav" aria-label="Main navigation">
   {links.map(link=><a href={link.href} key={link.href}>{link.label}</a>)}
  </nav>
  <div className="header-actions">
   <a className="account-link" href="/cart">Cart</a>
   <a className="account-link" href="/login">Sign in</a>
   <a className="button button-small" href="/reservations">Reserve</a>
  </div>
  <details className="mobile-nav">
   <summary aria-label="Open navigation"><span></span><span></span></summary>
   <nav aria-label="Mobile navigation">
   {[...links,{href:'/cart',label:'Cart'},{href:'/login',label:'Sign in'},{href:'/reservations',label:'Reserve a table'}].map(link=><a href={link.href} key={link.href}>{link.label}</a>)}
   </nav>
  </details>
 </header>;
}
