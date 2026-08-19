import { CreateNotificationDTO } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";


export const sendNotificationstep = createStep(
    "send-notification",
    async ( data: CreateNotificationDTO[], { container }) => {
        const notifcationModuleService = container.resolve(Modules.NOTIFICATION)

        const notification = notifcationModuleService.createNotifications(data)
        return new StepResponse(notification)
    }
)