"use client"

import QRCode from "qrcode"
import { useEffect, useState } from "react"

export default function WeChatQrCode({ value }: { value: string }) {
  const [src, setSrc] = useState("")

  useEffect(() => {
    let current = true
    QRCode.toDataURL(value, {
      width: 240,
      margin: 2,
      color: { dark: "#111827", light: "#FFFFFF" },
    }).then((dataUrl) => current && setSrc(dataUrl))
    return () => {
      current = false
    }
  }, [value])

  if (!src) {
    return <div className="h-60 w-60 animate-pulse rounded bg-ui-bg-subtle" />
  }

  return (
    <img
      src={src}
      width={240}
      height={240}
      alt="微信支付二维码"
      className="rounded-lg border border-ui-border-base"
    />
  )
}
