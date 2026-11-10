-- Student Pro is ₹149 a month including GST (owner, 10 Nov 2026).
-- Checkout sessions created by students must match the price. ₹199 stays allowed only so the
-- app version already deployed keeps working until the ₹149 version replaces it; a later
-- migration can drop 199. Safe to re-run. Apply to Preview first; Production with the owner's
-- approval at the same time as the ₹149 app version.
DROP POLICY IF EXISTS "Users insert own pending checkout" ON public.checkout_sessions;
CREATE POLICY "Users insert own pending checkout"
  ON public.checkout_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND amount_inr IN (149, 199)
    AND provider IN ('placeholder', 'stripe', 'razorpay')
  );
