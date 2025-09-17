import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, ArrowLeft, Package, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  image_url: string | null;
}

interface OrderSummary {
  id: string;
  total_amount: number;
  status: string;
  currency: string;
  created_at: string;
  receipt_url: string | null;
  shipping_address: Record<string, unknown> | null;
  customer_email: string | null;
  stripe_checkout_session_id: string | null;
  items: OrderItem[];
}

type FetchState = "idle" | "loading" | "error" | "success";

const formatCurrency = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
};

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [state, setState] = useState<FetchState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchOrder = async () => {
      if (!sessionId) {
        setError("Missing payment reference. If you completed a payment, please contact support.");
        setState("error");
        return;
      }

      setState("loading");
      setError(null);

      try {
        const { data, error } = await supabase.functions.invoke("retrieve-session", {
          body: { session_id: sessionId },
        });

        if (error) throw error;

        if (!data?.order) {
          throw new Error("Order details not found");
        }

        if (!isMounted) return;
        setOrder({
          ...data.order,
          currency: data.order.currency ?? "USD",
          items: data.order.items ?? [],
        });
        setState("success");
      } catch (err) {
        console.error("Failed to load order", err);
        if (!isMounted) return;
        setError("We couldn't verify your order. Please check your email or contact support.");
        setState("error");
      }
    };

    fetchOrder();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const currency = order?.currency ?? "USD";
  const lineTotal = useMemo(() => {
    if (!order) return 0;
    return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [order]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-circuit-green/10 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-circuit-green" />
          </div>
          <CardTitle className="text-2xl">Payment Successful!</CardTitle>
          <p className="text-muted-foreground max-w-md mx-auto">
            Thank you for your purchase! Your electronic kits are being prepared for shipment.
          </p>
          {order?.status && (
            <Badge variant="secondary" className="uppercase">
              {order.status}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          {state === "loading" && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Securing your order details…</span>
            </div>
          )}

          {state === "error" && error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-4 text-sm">
              {error}
            </div>
          )}

          {state === "success" && order && (
            <div className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Order ID</span>
                  <span className="font-medium text-foreground">{order.id}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Placed on</span>
                  <span>{new Date(order.created_at).toLocaleString()}</span>
                </div>
                {order.customer_email && (
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Confirmation sent to</span>
                    <span>{order.customer_email}</span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h2 className="text-lg font-semibold">Items</h2>
                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 border rounded-lg p-3"
                    >
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                      </div>
                      <div className="text-sm font-medium">
                        {formatCurrency(item.price * item.quantity, currency)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <span className="text-sm font-semibold">
                    {formatCurrency(lineTotal, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold">Total Paid</span>
                  <span className="text-lg font-bold text-foreground">
                    {formatCurrency(order.total_amount, currency)}
                  </span>
                </div>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg flex items-center gap-3 text-sm text-muted-foreground">
                <Package className="w-4 h-4" />
                <span>Your order is being processed. We&apos;ll update you once it ships!</span>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <Button asChild variant="default" className="w-full sm:w-auto">
                  <Link to="/">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Continue Shopping
                  </Link>
                </Button>
                {order.receipt_url && (
                  <Button asChild variant="outline" className="w-full sm:w-auto">
                    <a href={order.receipt_url} target="_blank" rel="noreferrer">
                      <Receipt className="w-4 h-4 mr-2" />
                      View Stripe Receipt
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}

          {sessionId && (
            <p className="text-xs text-muted-foreground text-center">
              Reference: {sessionId.slice(-8)}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
