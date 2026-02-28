import { http } from "@/service/http/client";

export interface CheckoutRequest {
  plan_name: string;
  payment_method: string;
}

export interface CheckoutResponse {
  order_id: string;
  provider_order_id: string;
  flow_type: "paypal_sdk" | "qrcode";
  qr_code_url: string;
  approval_url: string;
  amount: number;
  currency: string;
}

export interface OrderStatusResponse {
  order_id: string;
  status: string;
  fulfilled: boolean;
}

class PaymentService {
  async createCheckout(
    planName: string,
    paymentMethod: string = "paypal",
  ): Promise<CheckoutResponse> {
    return http.post("/xyzen/api/v1/payment/checkout", {
      plan_name: planName,
      payment_method: paymentMethod,
    });
  }

  async captureOrder(orderId: string): Promise<OrderStatusResponse> {
    return http.post(`/xyzen/api/v1/payment/orders/${orderId}/capture`, {});
  }

  async getOrderStatus(orderId: string): Promise<OrderStatusResponse> {
    return http.get(`/xyzen/api/v1/payment/orders/${orderId}/status`);
  }
}

export const paymentService = new PaymentService();
