export function BrandBanner() {
  return <section className="brand-banner" aria-labelledby="brand-banner-label">
    <div className="brand-banner-copy">
      <p className="brand-banner-eyebrow" id="brand-banner-label">More from Quack &amp; Honk</p>
      <h2>Tools with a little more quack.</h2>
      <p>QH PDF is one small thing from Quack &amp; Honk. Visit our main site to see what else we’re making.</p>
      <a
        className="brand-banner-link"
        href="https://quackandhonk.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Visit quackandhonk.com (opens in a new tab)"
      >
        Visit quackandhonk.com <span aria-hidden="true">↗</span>
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
