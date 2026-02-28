import { http } from "@/service/http/client";

export interface CheckoutRequest {
  plan_name: string;
  payment_method: string;
}

export interface CheckoutResponse {
  order_id: string;
  qr_code_url: string;
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
    paymentMethod: string = "alipaycn",
  ): Promise<CheckoutResponse> {
    return http.post("/xyzen/api/v1/payment/checkout", {
      plan_name: planName,
      payment_method: paymentMethod,
    });
  }

  async getOrderStatus(orderId: string): Promise<OrderStatusResponse> {
    return http.get(`/xyzen/api/v1/payment/orders/${orderId}/status`);
  }
}

export const paymentService = new PaymentService();
