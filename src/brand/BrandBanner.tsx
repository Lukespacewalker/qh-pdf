import { useI18n } from '../i18n/i18n';

export function BrandBanner() {
  const { t } = useI18n();
  return <section className="brand-banner" aria-labelledby="brand-banner-label">
    <div className="brand-banner-copy">
      <h2 id="brand-banner-label" className="sr-only">{t('Quack & Honk website')}</h2>
      <p>{t('By')} <strong>Quack &amp; Honk</strong></p>
      <a
        className="brand-banner-link"
        href="https://quackandhonk.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('Visit Quack & Honk (opens in a new tab)')}
      >
        {t('Visit Quack & Honk')} <span aria-hidden="true">↗</span>
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
