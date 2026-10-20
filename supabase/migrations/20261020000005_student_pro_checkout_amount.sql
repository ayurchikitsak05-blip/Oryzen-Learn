-- Student Pro checkout sessions are ₹199 / month.
DROP POLICY IF EXISTS "Users insert own pending checkout" ON public.checkout_sessions;
CREATE POLICY "Users insert own pending checkout"
  ON public.checkout_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND amount_inr = 199
    AND provider IN ('placeholder', 'stripe', 'razorpay')
  );
