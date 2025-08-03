import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

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
          <p className="text-muted-foreground">
            Thank you for your purchase! Your electronic kits are being prepared for shipment.
          </p>
          
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Package className="w-4 h-4" />
              <span>Order confirmation will be sent to your email</span>
            </div>
          </div>

          {sessionId && (
            <p className="text-xs text-muted-foreground">
              Reference: {sessionId.slice(-8)}
            </p>
          )}
          
          <div className="pt-4">
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