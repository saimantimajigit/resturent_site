export default function SiteFooter(){
 return <footer className="site-footer">
  <div className="footer-main">
   <div><a className="wordmark" href="/">SAVORÉ<span>·</span></a><p>An evening, composed with care.</p></div>
   <div><p className="footer-label">Explore</p><a href="/menu">The menu</a><a href="/experiences/chef-tasting">Chef’s tasting</a><a href="/private-dining">Private dining</a></div>
   <div><p className="footer-label">Visit</p><a href="/contact">Location & hours</a><a href="/our-story">Our story</a><a href="/chef">Meet the chef</a><a href="/demo">Staff sign-in</a></div>
   <div><p className="footer-label">Reservations</p><p>Tuesday – Sunday<br/>6:00 pm – 10:30 pm</p><a className="footer-reserve" href="/reservations">Reserve your evening ↗</a></div>
  </div>
  <div className="footer-bottom"><span>© {new Date().getFullYear()} SAVORÉ · A fictional demonstration restaurant</span><span>Made for lingering evenings.</span></div>
 </footer>;
}
