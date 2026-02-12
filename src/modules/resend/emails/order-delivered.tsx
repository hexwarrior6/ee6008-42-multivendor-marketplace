import { 
  Text, 
  Column, 
  Container, 
  Heading, 
  Html, 
  Img, 
  Row, 
  Section, 
  Tailwind, 
  Head, 
  Preview, 
  Body, 
  Link, 
} from "@react-email/components"
import { BigNumberValue, CustomerDTO, OrderDTO } from "@medusajs/framework/types"

type OrderDeliveredEmailProps = {
  order: OrderDTO & {
    customer: CustomerDTO
  }
  email_banner?: {
    body: string
    title: string
    url: string
  }
}

function OrderDeliveredEmailComponent({ order, email_banner }: OrderDeliveredEmailProps) {
  const shouldDisplayBanner = email_banner && "title" in email_banner

  const formatter = new Intl.NumberFormat([], {
    style: "currency",
    currencyDisplay: "narrowSymbol",
    currency: order.currency_code,
  })

  const formatPrice = (price: BigNumberValue) => {
    if (typeof price === "number") {
      return formatter.format(price)
    }

    if (typeof price === "string") {
      return formatter.format(parseFloat(price))
    }

    return price?.toString() || ""
  }

  return (
    <Tailwind>
      <Html className="font-sans bg-gray-100">
        <Head />
        <Preview>Your order has been delivered!</Preview>
        <Body className="bg-white my-10 mx-auto w-full max-w-2xl">
          {/* Header */}
          <Section className="bg-[#27272a] text-white px-6 py-4">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.2447 3.92183L12.1688 1.57686C10.8352 0.807712 9.20112 0.807712 7.86753 1.57686L3.77285 3.92183C2.45804 4.69098 1.63159 6.11673 1.63159 7.63627V12.345C1.63159 13.8833 2.45804 15.2903 3.77285 16.0594L7.84875 18.4231C9.18234 19.1923 10.8165 19.1923 12.15 18.4231L16.2259 16.0594C17.5595 15.2903 18.3672 13.8833 18.3672 12.345V7.63627C18.4048 6.11673 17.5783 4.69098 16.2447 3.92183ZM10.0088 14.1834C7.69849 14.1834 5.82019 12.3075 5.82019 10C5.82019 7.69255 7.69849 5.81657 10.0088 5.81657C12.3191 5.81657 14.2162 7.69255 14.2162 10C14.2162 12.3075 12.3379 14.1834 10.0088 14.1834Z" fill="currentColor"></path></svg>
          </Section>

          {/* Thank You Message */}
          <Container className="p-6">
            <Heading className="text-2xl font-bold text-center text-gray-800">
              Your order has been delivered!
            </Heading>
            <Text className="text-left text-gray-600 mt-2">
            Hi, {order.customer?.first_name || order.shipping_address?.first_name} {order.customer?.last_name || order.shipping_address?.last_name}!<br />
              We are pleased to inform you that your order #{order.display_id} has been successfully delivered. Thank you for shopping with us!
            </Text>
          </Container>

          {/* Promotional Banner */}
          {shouldDisplayBanner && (
            <Container
              className="mb-4 rounded-lg p-7"
              style={{
                background: "linear-gradient(to right, #3b82f6, #4f46e5)",
              }}
            >
              <Section>
                <Row>
                  <Column align="left">
                    <Heading className="text-white text-xl font-semibold">
                      {email_banner.title}
                    </Heading>
                    <Text className="text-white mt-2">{email_banner.body}</Text>
                  </Column>
                  <Column align="right">
                    <Link href={email_banner.url} className="font-semibold px-2 text-white underline">
                      Shop Now
                    </Link>
                  </Column>
                </Row>
              </Section>
            </Container>
          )}

          {/* Order Items */}
          <Container className="px-6">
            <Heading className="text-xl font-semibold text-gray-800 mb-4">
              Your Items
            </Heading>
            <Row>
              <Column>
                <Text className="text-sm m-0 my-2 text-gray-500">Order ID: #{order.display_id}</Text>
              </Column>
            </Row>
            {order.items?.map((item) => (
              <Section key={item.id} className="border-b border-gray-200 py-4">
                <Row>
                  <Column className="w-1/3">
                    <Img
                      src={item.thumbnail ?? ""}
                      alt={item.product_title ?? ""}
                      className="rounded-lg"
                      width="100%"
                    />
                  </Column>
                  <Column className="w-2/3 pl-4">
                    <Text className="text-lg font-semibold text-gray-800">
                      {item.product_title}
                    </Text>
                    <Text className="text-gray-600">{item.variant_title}</Text>
                    <Text className="text-gray-800 mt-2 font-bold">
                      {formatPrice(item.total)}
                    </Text>
                  </Column>
                </Row>
              </Section>
            ))}

            {/* Order Summary */}
            <Section className="mt-8">
              <Heading className="text-xl font-semibold text-gray-800 mb-4">
                Order Summary
              </Heading>
              <Row className="text-gray-600">
                <Column className="w-1/2">
                  <Text className="m-0">Subtotal</Text>
                </Column>
                <Column className="w-1/2 text-right">
                  <Text className="m-0">
                    {formatPrice(order.item_total)}
                  </Text>
                </Column>
              </Row>
              {order.shipping_methods?.map((method) => (
                <Row className="text-gray-600" key={method.id}>
                  <Column className="w-1/2">
                    <Text className="m-0">{method.name}</Text>
                  </Column>
                  <Column className="w-1/2 text-right">
                    <Text className="m-0">{formatPrice(method.total)}</Text>
                  </Column>
                </Row>
              ))}
              <Row className="text-gray-600">
                <Column className="w-1/2">
                  <Text className="m-0">Tax</Text>
                </Column>
                <Column className="w-1/2 text-right">
                  <Text className="m-0">{formatPrice(order.tax_total || 0)}</Text>
                </Column>
              </Row>
              <Row className="border-t border-gray-200 mt-4 text-gray-800 font-bold">
                <Column className="w-1/2">
                  <Text>Total</Text>
                </Column>
                <Column className="w-1/2 text-right">
                  <Text>{formatPrice(order.total)}</Text>
                </Column>
              </Row>
            </Section>
          </Container>

          {/* Footer */}
          <Section className="bg-gray-50 p-6 mt-10">
            <Text className="text-center text-gray-500 text-sm">
              If you have any questions, reply to this email or contact our support team at support@medusajs.com with the <span className="font-bold"> Order Token</span>.
            </Text>
            <Text className="text-center text-gray-500 text-sm">
              Order Token: {order.id}
            </Text>
            <Text className="text-center text-gray-400 text-xs mt-4">
              © {new Date().getFullYear()} Medusajs, Inc. All rights reserved.
            </Text>
          </Section>
        </Body>
      </Html>
    </Tailwind >
  )
}


const mockOrder = 
{
    "order": {
        "id": "order_01KGSGE26RVAJX7J7KA1KAQ82K",
        "display_id": 28,
        "custom_display_id": null,
        "currency_code": "sgd",
        "status": "pending",
        "version": 1,
        "summary": {
            "paid_total": 17,
            "raw_paid_total": {
                "value": "17",
                "precision": 20
            },
            "refunded_total": 0,
            "accounting_total": 17,
            "credit_line_total": 0,
            "transaction_total": 17,
            "pending_difference": 0,
            "raw_refunded_total": {
                "value": "0",
                "precision": 20
            },
            "current_order_total": 17,
            "original_order_total": 17,
            "raw_accounting_total": {
                "value": "17",
                "precision": 20
            },
            "raw_credit_line_total": {
                "value": "0",
                "precision": 20
            },
            "raw_transaction_total": {
                "value": "17",
                "precision": 20
            },
            "raw_pending_difference": {
                "value": "0",
                "precision": 20
            },
            "raw_current_order_total": {
                "value": "17",
                "precision": 20
            },
            "raw_original_order_total": {
                "value": "17",
                "precision": 20
            }
        },
        "total": 17,
        "metadata": {
            "seller_id": "store_01KFTZ972ZDSB7WS470AHGRQAN",
            "store_name": "SecondSeller"
        },
        "created_at": "2026-02-06T12:57:04.987Z",
        "updated_at": "2026-02-06T12:57:04.987Z",
        "region_id": "reg_01KCC6GD9SFDENB9FBR27XVQ6A",
        "subtotal": 17,
        "tax_total": 0,
        "discount_total": 0,
        "discount_tax_total": 0,
        "original_total": 17,
        "original_subtotal": 17,
        "original_tax_total": 0,
        "item_total": 15,
        "item_subtotal": 15,
        "item_tax_total": 0,
        "original_item_total": 15,
        "original_item_subtotal": 15,
        "original_item_tax_total": 0,
        "shipping_total": 2,
        "shipping_subtotal": 2,
        "shipping_tax_total": 0,
        "original_shipping_tax_total": 0,
        "original_shipping_subtotal": 2,
        "original_shipping_total": 2,
        "credit_line_total": 0,
        "credit_line_subtotal": 0,
        "credit_line_tax_total": 0,
        "items": [
            {
                "id": "ordli_01KGSGE26S59REKMXWFMMX7W3M",
                "title": "Summer Jacket",
                "subtitle": "Default variant",
                "thumbnail": null,
                "variant_id": "variant_01KG27CDEAZ6ADWBD3RDRWY5R4",
                "product_id": "prod_01KG27CDD4S4PY8AVRCF9J7K80",
                "product_title": "Summer Jacket",
                "product_description": "",
                "product_subtitle": "",
                "product_type": null,
                "product_type_id": null,
                "product_collection": null,
                "product_handle": "summer-jacket",
                "variant_sku": "JKT-SUM-01",
                "variant_barcode": null,
                "variant_title": "Default variant",
                "variant_option_values": null,
                "requires_shipping": true,
                "is_giftcard": false,
                "is_discountable": true,
                "is_tax_inclusive": false,
                "is_custom_price": false,
                "metadata": {},
                "raw_compare_at_unit_price": null,
                "raw_unit_price": {
                    "value": "15",
                    "precision": 20
                },
                "created_at": "2026-02-06T12:57:04.988Z",
                "updated_at": "2026-02-06T12:57:04.988Z",
                "deleted_at": null,
                "tax_lines": [],
                "adjustments": [],
                "compare_at_unit_price": null,
                "unit_price": 15,
                "quantity": 1,
                "raw_quantity": {
                    "value": "1",
                    "precision": 20
                },
                "detail": {
                    "id": "orditem_01KGSGE26T34PA805XVZTD4HVG",
                    "version": 1,
                    "metadata": null,
                    "order_id": "order_01KGSGE26RVAJX7J7KA1KAQ82K",
                    "raw_unit_price": null,
                    "raw_compare_at_unit_price": null,
                    "raw_quantity": {
                        "value": "1",
                        "precision": 20
                    },
                    "raw_fulfilled_quantity": {
                        "value": "0",
                        "precision": 20
                    },
                    "raw_delivered_quantity": {
                        "value": "0",
                        "precision": 20
                    },
                    "raw_shipped_quantity": {
                        "value": "0",
                        "precision": 20
                    },
                    "raw_return_requested_quantity": {
                        "value": "0",
                        "precision": 20
                    },
                    "raw_return_received_quantity": {
                        "value": "0",
                        "precision": 20
                    },
                    "raw_return_dismissed_quantity": {
                        "value": "0",
                        "precision": 20
                    },
                    "raw_written_off_quantity": {
                        "value": "0",
                        "precision": 20
                    },
                    "created_at": "2026-02-06T12:57:04.988Z",
                    "updated_at": "2026-02-06T12:57:04.988Z",
                    "deleted_at": null,
                    "item_id": "ordli_01KGSGE26S59REKMXWFMMX7W3M",
                    "unit_price": null,
                    "compare_at_unit_price": null,
                    "quantity": 1,
                    "fulfilled_quantity": 0,
                    "delivered_quantity": 0,
                    "shipped_quantity": 0,
                    "return_requested_quantity": 0,
                    "return_received_quantity": 0,
                    "return_dismissed_quantity": 0,
                    "written_off_quantity": 0
                },
                "subtotal": 15,
                "total": 15,
                "original_subtotal": 15,
                "original_total": 15,
                "discount_subtotal": 0,
                "discount_tax_total": 0,
                "discount_total": 0,
                "tax_total": 0,
                "original_tax_total": 0,
                "refundable_total_per_unit": 15,
                "refundable_total": 15,
                "fulfilled_total": 0,
                "shipped_total": 0,
                "return_requested_total": 0,
                "return_received_total": 0,
                "return_dismissed_total": 0,
                "write_off_total": 0,
                "raw_subtotal": {
                    "value": "15",
                    "precision": 20
                },
                "raw_total": {
                    "value": "15",
                    "precision": 20
                },
                "raw_original_subtotal": {
                    "value": "15",
                    "precision": 20
                },
                "raw_original_total": {
                    "value": "15",
                    "precision": 20
                },
                "raw_discount_subtotal": {
                    "value": "0",
                    "precision": 20
                },
                "raw_discount_tax_total": {
                    "value": "0",
                    "precision": 20
                },
                "raw_discount_total": {
                    "value": "0",
                    "precision": 20
                },
                "raw_tax_total": {
                    "value": "0",
                    "precision": 20
                },
                "raw_original_tax_total": {
                    "value": "0",
                    "precision": 20
                },
                "raw_refundable_total_per_unit": {
                    "value": "15",
                    "precision": 20
                },
                "raw_refundable_total": {
                    "value": "15",
                    "precision": 20
                },
                "raw_fulfilled_total": {
                    "value": "0",
                    "precision": 20
                },
                "raw_shipped_total": {
                    "value": "0",
                    "precision": 20
                },
                "raw_return_requested_total": {
                    "value": "0",
                    "precision": 20
                },
                "raw_return_received_total": {
                    "value": "0",
                    "precision": 20
                },
                "raw_return_dismissed_total": {
                    "value": "0",
                    "precision": 20
                },
                "raw_write_off_total": {
                    "value": "0",
                    "precision": 20
                },
                "variant": {
                    "id": "variant_01KG27CDEAZ6ADWBD3RDRWY5R4",
                    "title": "Default variant",
                    "sku": "JKT-SUM-01",
                    "barcode": null,
                    "ean": null,
                    "upc": null,
                    "allow_backorder": false,
                    "manage_inventory": true,
                    "hs_code": null,
                    "origin_country": null,
                    "mid_code": null,
                    "material": null,
                    "weight": null,
                    "length": null,
                    "height": null,
                    "width": null,
                    "metadata": null,
                    "variant_rank": 0,
                    "thumbnail": null,
                    "product_id": "prod_01KG27CDD4S4PY8AVRCF9J7K80",
                    "product": {
                        "id": "prod_01KG27CDD4S4PY8AVRCF9J7K80",
                        "title": "Summer Jacket",
                        "handle": "summer-jacket",
                        "subtitle": "",
                        "description": "",
                        "is_giftcard": false,
                        "status": "published",
                        "thumbnail": null,
                        "weight": null,
                        "length": null,
                        "height": null,
                        "width": null,
                        "origin_country": null,
                        "hs_code": null,
                        "mid_code": null,
                        "material": null,
                        "discountable": true,
                        "external_id": null,
                        "metadata": null,
                        "type_id": null,
                        "type": null,
                        "collection_id": null,
                        "collection": null,
                        "created_at": "2026-01-28T11:56:21.798Z",
                        "updated_at": "2026-01-28T11:56:21.798Z",
                        "deleted_at": null
                    },
                    "created_at": "2026-01-28T11:56:21.834Z",
                    "updated_at": "2026-01-28T11:56:21.834Z",
                    "deleted_at": null
                }
            }
        ],
        "credit_lines": [],
        "shipping_address": {
            "id": "ordaddr_01KGSGE26PQ6073J4SXW8FNC9E",
            "customer_id": null,
            "company": "aa",
            "first_name": "aas",
            "last_name": "aa",
            "address_1": "asd",
            "address_2": "",
            "city": "asd",
            "country_code": "sg",
            "province": "",
            "postal_code": "sdd",
            "phone": "",
            "metadata": null,
            "created_at": "2026-02-06T12:56:48.877Z",
            "updated_at": "2026-02-06T12:56:48.877Z",
            "deleted_at": null
        },
        "billing_address": {
            "id": "ordaddr_01KGSGE26P1KN4TY4NFKECRWFM",
            "customer_id": null,
            "company": "aa",
            "first_name": "aas",
            "last_name": "aa",
            "address_1": "asd",
            "address_2": "",
            "city": "asd",
            "country_code": "sg",
            "province": "",
            "postal_code": "sdd",
            "phone": "",
            "metadata": null,
            "created_at": "2026-02-06T12:56:48.877Z",
            "updated_at": "2026-02-06T12:56:48.877Z",
            "deleted_at": null
        },
        "shipping_methods": [
            {
                "id": "ordsm_01KGSGE26RA520DVCNW7WMXDVM",
                "name": "Seller 2 Standard Shipping",
                "description": null,
                "is_tax_inclusive": false,
                "is_custom_amount": false,
                "shipping_option_id": "so_01KG266RM4J3TV041ADC1JYPKJ",
                "data": {},
                "metadata": null,
                "raw_amount": {
                    "value": "2",
                    "precision": 20
                },
                "created_at": "2026-02-06T12:57:04.988Z",
                "updated_at": "2026-02-06T12:57:04.988Z",
                "deleted_at": null,
                "tax_lines": [],
                "adjustments": [],
                "amount": 2,
                "order_id": "order_01KGSGE26RVAJX7J7KA1KAQ82K",
                "detail": {
                    "id": "ordspmv_01KGSGE26R2FVGR95PQYZ2VPY8",
                    "version": 1,
                    "order_id": "order_01KGSGE26RVAJX7J7KA1KAQ82K",
                    "return_id": null,
                    "exchange_id": null,
                    "claim_id": null,
                    "created_at": "2026-02-06T12:57:04.988Z",
                    "updated_at": "2026-02-06T12:57:04.988Z",
                    "deleted_at": null,
                    "shipping_method_id": "ordsm_01KGSGE26RA520DVCNW7WMXDVM"
                },
                "subtotal": 2,
                "total": 2,
                "original_subtotal": 2,
                "original_total": 2,
                "discount_total": 0,
                "discount_subtotal": 0,
                "discount_tax_total": 0,
                "tax_total": 0,
                "original_tax_total": 0,
                "raw_subtotal": {
                    "value": "2",
                    "precision": 20
                },
                "raw_total": {
                    "value": "2",
                    "precision": 20
                },
                "raw_original_subtotal": {
                    "value": "2",
                    "precision": 20
                },
                "raw_original_total": {
                    "value": "2",
                    "precision": 20
                },
                "raw_discount_total": {
                    "value": "0",
                    "precision": 20
                },
                "raw_discount_subtotal": {
                    "value": "0",
                    "precision": 20
                },
                "raw_discount_tax_total": {
                    "value": "0",
                    "precision": 20
                },
                "raw_tax_total": {
                    "value": "0",
                    "precision": 20
                },
                "raw_original_tax_total": {
                    "value": "0",
                    "precision": 20
                }
            }
        ],
        "payment_collections": [
            {
                "id": "pay_col_01KGSGDN5S4KRMM88F8J2XWCHK",
                "currency_code": "sgd",
                "completed_at": "2026-02-06T12:57:05.839Z",
                "status": "completed",
                "metadata": null,
                "raw_amount": {
                    "value": "17",
                    "precision": 20
                },
                "raw_authorized_amount": {
                    "value": "17",
                    "precision": 20
                },
                "raw_captured_amount": {
                    "value": "17",
                    "precision": 20
                },
                "raw_refunded_amount": {
                    "value": "0",
                    "precision": 20
                },
                "created_at": "2026-02-06T12:56:51.641Z",
                "updated_at": "2026-02-06T12:57:05.840Z",
                "deleted_at": null,
                "payments": [
                    {
                        "id": "pay_01KGSGE30SZ1DJ9RBJ94WD7YFZ",
                        "currency_code": "sgd",
                        "provider_id": "pp_stripe_stripe",
                        "data": {
                            "id": "pi_3SxoagRvoEFmjfPt0cO2WNEC",
                            "amount": 1700,
                            "object": "payment_intent",
                            "review": null,
                            "source": null,
                            "status": "succeeded",
                            "created": 1770382614,
                            "invoice": null,
                            "currency": "sgd",
                            "customer": null,
                            "livemode": false,
                            "metadata": {
                                "session_id": "payses_01KGSGDN6HBMJPGJJJXETXPG07"
                            },
                            "shipping": null,
                            "processing": null,
                            "application": null,
                            "canceled_at": null,
                            "description": null,
                            "next_action": null,
                            "on_behalf_of": null,
                            "client_secret": "pi_3SxoagRvoEFmjfPt0cO2WNEC_secret_mF49gA3n9aREHyNnbyCHB6qGp",
                            "latest_charge": "ch_3SxoagRvoEFmjfPt0MOCzsQj",
                            "receipt_email": null,
                            "transfer_data": null,
                            "amount_details": {
                                "tip": {}
                            },
                            "capture_method": "automatic",
                            "payment_method": "pm_1SxoasRvoEFmjfPtLrxk4hct",
                            "transfer_group": null,
                            "amount_received": 1700,
                            "customer_account": null,
                            "amount_capturable": 0,
                            "last_payment_error": null,
                            "setup_future_usage": null,
                            "cancellation_reason": null,
                            "confirmation_method": "automatic",
                            "payment_method_types": [
                                "card",
                                "grabpay",
                                "wechat_pay",
                                "paynow"
                            ],
                            "statement_descriptor": null,
                            "application_fee_amount": null,
                            "payment_method_options": {
                                "card": {
                                    "network": null,
                                    "installments": null,
                                    "mandate_options": null,
                                    "request_three_d_secure": "automatic"
                                },
                                "paynow": {},
                                "grabpay": {},
                                "wechat_pay": {
                                    "app_id": null,
                                    "client": null
                                }
                            },
                            "automatic_payment_methods": {
                                "enabled": true,
                                "allow_redirects": "always"
                            },
                            "statement_descriptor_suffix": null,
                            "excluded_payment_method_types": null,
                            "payment_method_configuration_details": {
                                "id": "pmc_1S4bhKRvoEFmjfPtHNdkFbT8",
                                "parent": null
                            }
                        },
                        "metadata": null,
                        "captured_at": "2026-02-06T12:57:05.825Z",
                        "canceled_at": null,
                        "payment_collection_id": "pay_col_01KGSGDN5S4KRMM88F8J2XWCHK",
                        "payment_session": {
                            "id": "payses_01KGSGDN6HBMJPGJJJXETXPG07"
                        },
                        "raw_amount": {
                            "value": "17",
                            "precision": 20
                        },
                        "created_at": "2026-02-06T12:57:05.817Z",
                        "updated_at": "2026-02-06T12:57:05.833Z",
                        "deleted_at": null,
                        "payment_session_id": "payses_01KGSGDN6HBMJPGJJJXETXPG07",
                        "refunds": [],
                        "captures": [
                            {
                                "id": "capt_01KGSGE311KCBP3W4F9BZBVNKQ",
                                "payment_id": "pay_01KGSGE30SZ1DJ9RBJ94WD7YFZ",
                                "metadata": null,
                                "created_by": null,
                                "raw_amount": {
                                    "value": "17",
                                    "precision": 20
                                },
                                "created_at": "2026-02-06T12:57:05.832Z",
                                "updated_at": "2026-02-06T12:57:05.832Z",
                                "deleted_at": null,
                                "amount": 17
                            }
                        ],
                        "amount": 17
                    }
                ],
                "amount": 17,
                "authorized_amount": 17,
                "captured_amount": 17,
                "refunded_amount": 0
            }
        ],
        "fulfillments": [],
        "payment_status": "captured",
        "fulfillment_status": "not_fulfilled"
    },
}
// @ts-ignore
export default () => <OrderDeliveredEmailComponent {...mockOrder} />

export const orderDeliveredEmail = (props: OrderDeliveredEmailProps) => (
  <OrderDeliveredEmailComponent {...props} />
)