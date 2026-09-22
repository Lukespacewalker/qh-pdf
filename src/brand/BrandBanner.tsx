import { useI18n } from '../i18n/i18n';

export function BrandBanner() {
  const { t } = useI18n();
  return <section className="brand-banner" aria-labelledby="brand-banner-label">
    <div className="brand-banner-copy">
      <p className="brand-banner-eyebrow" id="brand-banner-label">{t('More from Quack & Honk')}</p>
      <h2>{t('Tools with a little more quack.')}</h2>
      <p>{t('QH PDF is one small thing from Quack & Honk. Visit our main site to see what else we’re making.')}</p>
      <a
        className="brand-banner-link"
        href="https://quackandhonk.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('Visit quackandhonk.com (opens in a new tab)')}
      >
        {t('Visit quackandhonk.com')} <span aria-hidden="true">↗</span>
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
