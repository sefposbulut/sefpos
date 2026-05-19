import type { FeatureItem } from '../content/siteContent';

export function FeatureCard({ icon: Icon, title, desc, tag }: FeatureItem) {
  return (
    <article className="group relative bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow-xl hover:border-orange-200 transition-all duration-300">
      {tag && (
        <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
          {tag}
        </span>
      )}
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-700 flex items-center justify-center mb-4 shadow-lg shadow-orange-500/25 group-hover:scale-110 transition-transform">
        <Icon className="w-6 h-6 text-white" strokeWidth={2} />
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-600 text-sm leading-relaxed">{desc}</p>
    </article>
  );
}
