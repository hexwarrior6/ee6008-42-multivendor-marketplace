import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Check, UserMini } from "@medusajs/icons"
import { useEffect, useState } from "react"
import { Button, Container, Heading, Text, clx } from "@medusajs/ui"
import { OnboardingRow } from "../../components/onboarding-row";

type OnboardingResponse = {
    store_information: boolean,
    locations_shipping: boolean,
    stripe_connect: boolean
}

const onboardingPage = () => {
    const [onboardingData, setOnboardingData] = useState<OnboardingResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [stripeLoading, setStripeLoading] = useState(false)
    const [stripeError, setStripeError] = useState<string | null>(null)

    useEffect(() => {
        const fetchOnboardingStatus = async () => {
            try {
                setLoading(true)
                const response = await fetch('/admin/onboarding', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                         },
                    body: JSON.stringify({}),
                })
                
                if (!response.ok) {
                    throw new Error('Failed to fetch onboarding status')
                }
                
                const data = await response.json()
                setOnboardingData(data.result)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred')
                console.error('Error fetching onboarding status:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchOnboardingStatus()
    }, [])

    const handleStripeConnect = async () => {
        try {
            setStripeLoading(true)
            setStripeError(null)

            const response = await fetch('/admin/stripe-connect/account-link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            })

            if (!response.ok) {
                throw new Error('Failed to generate Stripe onboarding link')
            }

            const { url } = await response.json()
            
            // Redirect to Stripe onboarding in new tab
            window.open(url, '_blank')
            
        } catch (err) {
            setStripeError(err instanceof Error ? err.message : 'Failed to connect to Stripe')
            console.error('Error creating Stripe account link:', err)
        } finally {
            setStripeLoading(false)
        }
    }

    if (loading) {
        // return <div>Loading...</div>
        return (
        <Container className="divide-y p-0">
            <div className="flex items-center justify-center px-6 py-4">
                <Text>Loading onboarding data...</Text>
            </div>
        </Container>
        )
    }

    if (error) {
        return <div>Error: {error}</div>
    }

    if (!onboardingData) {
        return <div>No onboarding data available.</div>
    }

    return (
        // <div>
        //     {/* Your onboarding UI here */}
        //     <pre>{JSON.stringify(onboardingData, null, 2)}</pre>
        // </div>
        <Container className="divide-y p-0">
            <div className="flex items-center justify-between px-6 py-4">
                <div>
                    <Heading>Welcome to marketplace</Heading>
                    <Text className="text-ui-fg-subtle" size="small">
                        Complete these steps to start selling
                    </Text>
                </div>
                <div className="px-6 py-4">
                    <OnboardingRow
                    label="Complete store information"
                    state={onboardingData.store_information}
                    link="/settings/store"
                    buttonLabel="Manage"
                    />
                    <OnboardingRow
                    label="Set up locations for shipping"
                    state={onboardingData.locations_shipping}
                    link="/settings/store"
                    buttonLabel="Manage"
                    />
                    <div className="flex justify-between py-2">
                        <div className="flex items-center gap-3">
                            <div className={clx("border w-6 h-6 rounded-full flex items-center justify-center", {
                                "border-dashed": !onboardingData.stripe_connect,
                                "border-current": onboardingData.stripe_connect,
                            })}>
                                {onboardingData.stripe_connect && <Check />}
                            </div>
                            <Heading className="text-sm">Connect Stripe Account</Heading>
                        </div>
                        <Button
                            className="min-w-20"
                            onClick={handleStripeConnect}
                            isLoading={stripeLoading}
                            disabled={stripeLoading}
                        >
                            Manage
                        </Button>
                    </div>
                </div>
            </div>
        </Container>
    )
}

export const config = defineRouteConfig({
  label: "Onboarding",
  icon: UserMini,
});
export default onboardingPage;