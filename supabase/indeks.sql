-- Indeks untuk mempercepat query yang dipakai aplikasi.
-- Aman dijalankan berulang kali (IF NOT EXISTS). Jalankan sekali di Supabase > SQL Editor.

create index if not exists submissions_assignment_idx   on public.submissions (assignment_id);
create index if not exists submissions_student_idx      on public.submissions (student_id);
create index if not exists submissions_status_idx       on public.submissions (status) where score is null;
create index if not exists submissions_graded_idx       on public.submissions (graded_at) where score is not null;
create index if not exists submission_photos_sub_idx    on public.submission_photos (submission_id);
create index if not exists assignments_status_created   on public.assignments (status, created_at desc);
create index if not exists assignment_classes_class_idx on public.assignment_classes (class_id);
create index if not exists assignment_classes_asg_idx   on public.assignment_classes (assignment_id);
create index if not exists profiles_class_idx           on public.profiles (class_id) where role = 'student';
create index if not exists materials_created_idx        on public.materials (created_at desc);

analyze;
