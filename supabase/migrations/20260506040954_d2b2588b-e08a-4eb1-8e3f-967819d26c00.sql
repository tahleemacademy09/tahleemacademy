-- Restrict PII on public-class tables to admins/teachers only.
-- Anonymous visitors can still INSERT (register / join as guest) but can no longer SELECT.

DROP POLICY IF EXISTS "Anyone can view guests"        ON public.public_class_guests;
DROP POLICY IF EXISTS "Anyone can view registrations" ON public.public_class_registrations;
