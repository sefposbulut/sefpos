import { Check, X } from 'lucide-react';
import type { PricingPlan } from '../content/siteContent';
import { pricingPlanFeaturePreview } from '../content/siteContent';

type PricingPlanCardProps = {
  plan: PricingPlan;
  onCta: () => void;
  variant?: 'preview' | 'full';
};

export function PricingPlanCard({ plan, onCta, variant = 'full' }: PricingPlanCardProps) {
  const highlight = Boolean(plan.highlight);
  const isPreview = variant === 'preview';

  return (
    <div className={`landing-pricing-slot landing-pricing-slot--tier-${plan.tier}`}>
      <article
        className={[
          'landing-pricing-card',
          `landing-pricing-card--tier-${plan.tier}`,
          highlight ? 'landing-pricing-card--highlight' : '',
        ].join(' ')}
      >
        {highlight && <div className="landing-pricing-card-accent" aria-hidden />}

        <header className="landing-pricing-card-head">
          {(plan.badge || plan.highlight) && (
            <span className="landing-pricing-badge">{plan.badge ?? 'En popüler'}</span>
          )}
          <h2 className="landing-pricing-title">{plan.name}</h2>
          <p className="landing-pricing-ideal">{plan.ideal}</p>
          <ul className="landing-pricing-limits">
            {plan.limits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </header>

        {isPreview ? (
          <ul className="landing-pricing-list">
            {pricingPlanFeaturePreview(plan, 6).map((item) => (
              <li key={item} className="landing-pricing-item">
                <Check className="landing-pricing-check" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="landing-pricing-modules">
            {plan.groups.map((group) => (
              <div key={group.title} className="landing-pricing-module">
                <h3 className="landing-pricing-group-label">{group.title}</h3>
                <ul className="landing-pricing-sublist">
                  {group.items.map((item) => (
                    <li key={item} className="landing-pricing-item">
                      <Check className="landing-pricing-check" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {plan.excluded && plan.excluded.length > 0 && (
              <div className="landing-pricing-module landing-pricing-module--excluded">
                <h3 className="landing-pricing-group-label landing-pricing-group-label--muted">Bu pakette yok</h3>
                <ul className="landing-pricing-sublist">
                  {plan.excluded.map((item) => (
                    <li key={item} className="landing-pricing-item landing-pricing-item--excluded">
                      <X className="landing-pricing-check landing-pricing-check--muted" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onCta}
          className={
            highlight
              ? 'landing-pricing-cta landing-btn-primary justify-center'
              : 'landing-pricing-cta landing-pricing-cta--dark'
          }
        >
          Teklif Al
        </button>
      </article>
    </div>
  );
}
