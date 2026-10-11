import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview"

export default function RecommendationsSkeleton() {
  return (
    <div
      className="content-container py-12 small:py-16"
      aria-hidden="true"
      data-testid="recommendations-loading"
    >
      <div className="mb-8 animate-pulse">
        <div className="h-8 w-40 bg-ui-bg-subtle" />
        <div className="mt-2 h-5 w-64 max-w-full bg-ui-bg-subtle" />
      </div>
      <div className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8">
        {[0, 1, 2, 3].map((index) => (
          <SkeletonProductPreview key={index} />
        ))}
      </div>
    </div>
  )
}
