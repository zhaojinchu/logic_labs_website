import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, ArrowLeft, Package, Loader2, AlertCircle, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";

type OrderItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
};

type OrderSummary = {
  id: string;
  created_at: string;
  total_amount: number;
  status: string;
  receipt_url: string | null;
  items: OrderItem[];
};

type OrderItemResponse = {
  id: string;
  product_id: string;
  product_name?: string | null;
  quantity: number;
  price: number | string | null;
};

type ConfirmOrderResponse = {
  id: string;
  created_at: string;
  total_amount: number | string | null;
  status: string;
  receipt_url?: string | null;
  items?: OrderItemResponse[];
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { clearCart } = useCart();
  const clearCartRef = useRef(clearCart);
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clearCartRef.current = clearCart;
  }, [clearCart]);

  useEffect(() => {
    let isActive = true;

    async function confirmOrder() {
      if (!sessionId) {
        setError("Missing payment reference.");
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const { data, error: fnError } = await supabase.functions.invoke("confirm-order", {
          body: { sessionId },
        });

        if (fnError)
          throw new Error(fnError.message ?? "Unable to confirm payment");

        const responseOrder = (data as { order?: ConfirmOrderResponse } | null)?.order;
        if (!responseOrder)
          throw new Error("Order not found");

        const mapped: OrderSummary = {
          id: responseOrder.id,
          created_at: responseOrder.created_at,
          total_amount: Number(responseOrder.total_amount ?? 0),
          status: responseOrder.status,
          receipt_url: responseOrder.receipt_url ?? null,
          items: (responseOrder.items ?? []).map((item: OrderItemResponse) => ({
            id: item.id,
            product_id: item.product_id,
            product_name: item.product_name || "Electronic kit",
            quantity: item.quantity,
            price: Number(item.price ?? 0),
          })),
        };

        if (!isActive)
          return;

        setOrder(mapped);
        setError(null);
        setLoading(false);

        try {
          await clearCartRef.current?.();
        } catch (cartError) {
          console.error("Failed to clear cart after purchase", cartError);
        }
      } catch (err) {
        console.error("Failed to confirm order", err);
        if (!isActive)
          return;

        setOrder(null);
        setError(err instanceof Error ? err.message : "Failed to confirm payment");
        setLoading(false);
      }
    }

    confirmOrder();

    return () => {
      isActive = false;
    };
  }, [sessionId]);

  const formattedDate = useMemo(() => {
    if (!order?.created_at)
      return null;
    try {
      return new Date(order.created_at).toLocaleString();
    } catch {
      return order.created_at;
    }
  }, [order?.created_at]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 bg-circuit-green/10 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-circuit-green" />
          </div>
          <CardTitle className="text-2xl">Payment Successful!</CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-muted-foreground py-6">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p>Confirming your order...</p>
            </div>
          )}

          {!loading && error && (
            <div className="space-y-3">
              <div className="bg-destructive/10 text-destructive rounded-lg p-4 flex items-center gap-3 text-left">
                <AlertCircle className="w-5 h-5" />
                <div>
                  <p className="font-semibold">We couldn&apos;t confirm your order</p>
                  <p className="text-sm text-destructive/80">{error}</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                If you were charged, our support team will have the record.
                Please contact us with your payment reference so we can help you out.
              </p>
            </div>
          )}

          {!loading && !error && order && (
            <div className="space-y-4 text-left">
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <Package className="w-5 h-5 mt-0.5 text-circuit-green" />
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">Order #{order.id.slice(0, 8)}</p>
                    {formattedDate && (
                      <p className="text-sm text-muted-foreground">Placed on {formattedDate}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      We&apos;ve emailed your receipt and will let you know when your kits ship.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {order.items.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Your payment was successful, but we couldn&apos;t load the line items. A detailed receipt has been emailed to you.
                  </p>
                )}

                {order.items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 text-sm">
                    <div>
                      <p className="font-medium text-foreground">{item.product_name}</p>
                      <p className="text-muted-foreground">Qty {item.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-foreground">
                        {currencyFormatter.format(item.price * item.quantity)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {currencyFormatter.format(item.price)} each
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="font-semibold text-foreground">Order total</span>
                <span className="font-semibold text-foreground">
                  {currencyFormatter.format(order.total_amount)}
                </span>
              </div>

              {order.receipt_url && (
                <Button variant="outline" asChild className="w-full">
                  <a href={order.receipt_url} target="_blank" rel="noreferrer">
                    <Receipt className="w-4 h-4 mr-2" />
                    View Stripe receipt
                  </a>
                </Button>
              )}
            </div>
          )}

          {sessionId && (
            <p className="text-xs text-muted-foreground">
              Payment reference: {sessionId.slice(-8)}
            </p>
          )}

          <div className="pt-2">
            <Button asChild className="w-full">
              <Link to="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Continue Shopping
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}