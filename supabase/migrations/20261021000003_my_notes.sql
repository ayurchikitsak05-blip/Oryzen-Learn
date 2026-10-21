CREATE TABLE IF NOT EXISTS public.note_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.note_subjects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_note_subjects_user ON public.note_subjects(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_notes_subject ON public.study_notes(subject_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_note_subjects_updated_at ON public.note_subjects;
CREATE TRIGGER trg_note_subjects_updated_at
  BEFORE UPDATE ON public.note_subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_study_notes_updated_at ON public.study_notes;
CREATE TRIGGER trg_study_notes_updated_at
  BEFORE UPDATE ON public.study_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.note_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their note subjects" ON public.note_subjects;
CREATE POLICY "Users manage their note subjects"
  ON public.note_subjects
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage their study notes" ON public.study_notes;
CREATE POLICY "Users manage their study notes"
  ON public.study_notes
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.note_subjects subject
      WHERE subject.id = subject_id AND subject.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_notes TO authenticated;
