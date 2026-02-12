import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import { Logger, ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types"
import { CreateEmailOptions, Resend } from "resend"
import { orderPlacedEmail } from "./emails/order-placed"
import { orderDeliveredEmail } from "./emails/order-delivered"


type ResendOptions = {
    api_key: string
    from: string
    html_templates?: Record<string, {
        subject?: string
        content: string
    }>
}

type InjectedDependencies = {
    logger: Logger
}

enum Templates {
    ORDER_PLACED = "order_placed",
    ORDER_DELIVERED = "order_delivered",
}

const templates: {[key in Templates]?: (props: unknown) => React.ReactNode} = {
    //Add templates here
    [Templates.ORDER_PLACED]: orderPlacedEmail,
    [Templates.ORDER_DELIVERED]: orderDeliveredEmail,
}

class ResendNotificationProviderService extends AbstractNotificationProviderService {

    constructor(
        { logger }: InjectedDependencies,
        options: ResendOptions
    ) {
        super()
        this.resendClient = new Resend(options.api_key)
        this.options = options
        this.logger = logger
    }

    static identifier = "notification-resend"
    private resendClient: Resend
    private options: ResendOptions
    private logger: Logger

    static validateOptions(options: Record<any, any>)  {
        if(!options.api_key) {
            throw new MedusaError(MedusaError.Types.INVALID_DATA, "Resend provider requires an api_key")
        }
        if(!options.from) {
            throw new MedusaError(MedusaError.Types.INVALID_DATA, "Option `from` is required in the provider's options.")
        }
    }

    getTemplate(template: Templates) {
        if (this.options.html_templates?.[template]) {
            return this.options.html_templates?.[template].content
        }
        const allowedTemplates = Object.keys(templates)

        if (!allowedTemplates.includes(template)) {
            return null
        }
        return templates[template]
    }

    getTemplateSubject(template: Templates) {
        if (this.options.html_templates?.[template]?.subject) {
            return this.options.html_templates?.[template]?.subject
        }
        //Add templates subjects here
        switch(template) {
            case Templates.ORDER_PLACED:
                return "Order Confirmation"
            case Templates.ORDER_DELIVERED:
                return "Your Order has been Delivered"
            default:
                return "New Email"
        }
    }

    async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
        const template = this.getTemplate(notification.template as Templates)

        if(!template) {
            this.logger.error(`Could not find email template for ${notification.template}. The valid options are: ${Object.values(templates)}`)
            return {}
        }
        const commonOptions = {
            from: this.options.from,
            to: notification.to,
            subject: this.getTemplateSubject(notification.template as Templates),
        }

        let emailOptions: CreateEmailOptions
        if (typeof template === "string") {
            emailOptions = {
                ...commonOptions,
                html: template,
            }
        } else {
            emailOptions = {
                ...commonOptions,
                react: template(notification.data)
            }
        }
        const { data, error } = await this.resendClient.emails.send(emailOptions)

        if (error || !data ) {
            if(error) {
                this.logger.error(`Error sending email via Resend: ${error.message}`)
            } else {
                this.logger.error(`Unknown error sending email via Resend.`)
            }
            return {}
        }
        return {id: data.id}
    }
}

export default ResendNotificationProviderService