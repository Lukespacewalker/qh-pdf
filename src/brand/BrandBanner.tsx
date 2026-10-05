export function BrandBanner() {
  return <section className="brand-banner" aria-labelledby="brand-banner-label">
    <div className="brand-banner-copy">
      <h2 id="brand-banner-label" className="sr-only">More from Quack &amp; Honk</h2>
      <p>Made with care by <strong>Quack &amp; Honk</strong></p>
      <a
        className="brand-banner-link"
        href="https://quackandhonk.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Visit quackandhonk.com (opens in a new tab)"
      >
        Explore Quack &amp; Honk <span aria-hidden="true">↗</span>
      </a>
    </div>
    <img
      className="brand-banner-mascot"
      src={`${import.meta.env.BASE_URL}mascots/quack-hello.webp`}
      alt=""
      aria-hidden="true"
    />
  </section>;
}
