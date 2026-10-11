import { HttpTypes } from "@medusajs/types"
import { Text } from "@medusajs/ui"

type LineItemOptionsProps = {
  variant: HttpTypes.StoreProductVariant | undefined
  variantLabel?: string
  "data-testid"?: string
  "data-value"?: HttpTypes.StoreProductVariant
}

const LineItemOptions = ({
  variant,
  variantLabel,
  "data-testid": dataTestid,
  "data-value": dataValue,
}: LineItemOptionsProps) => {
  const title = variant?.title ?? ""
  const label = variantLabel
    ? variantLabel.replace("{title}", title)
    : `Variant: ${title}`

  return (
    <Text
      data-testid={dataTestid}
      data-value={dataValue}
      className="inline-block txt-medium text-ui-fg-subtle w-full overflow-hidden text-ellipsis"
    >
      {label}
    </Text>
  )
}

export default LineItemOptions
