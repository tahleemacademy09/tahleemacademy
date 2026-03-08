export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      ai_query_logs: {
        Row: {
          created_at: string
          id: string
          intent_type: string | null
          query_text: string
          result_meta: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          intent_type?: string | null
          query_text: string
          result_meta?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          intent_type?: string | null
          query_text?: string
          result_meta?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          comment: string | null
          created_at: string | null
          feedback: string | null
          file_url: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          id: string
          is_late: boolean | null
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          assignment_id: string
          comment?: string | null
          created_at?: string | null
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_late?: boolean | null
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          assignment_id?: string
          comment?: string | null
          created_at?: string | null
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_late?: boolean | null
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "subject_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          created_at: string | null
          device_info: string | null
          duration_seconds: number | null
          id: string
          ip_address: string | null
          joined_at: string | null
          left_at: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_info?: string | null
          duration_seconds?: number | null
          id?: string
          ip_address?: string | null
          joined_at?: string | null
          left_at?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_info?: string | null
          duration_seconds?: number | null
          id?: string
          ip_address?: string | null
          joined_at?: string | null
          left_at?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          avatar: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_private: boolean | null
          last_message: string | null
          last_message_at: string | null
          level: string | null
          member_count: number | null
          name: string | null
          name_ar: string | null
          type: string | null
        }
        Insert: {
          avatar?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_private?: boolean | null
          last_message?: string | null
          last_message_at?: string | null
          level?: string | null
          member_count?: number | null
          name?: string | null
          name_ar?: string | null
          type?: string | null
        }
        Update: {
          avatar?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_private?: boolean | null
          last_message?: string | null
          last_message_at?: string | null
          level?: string | null
          member_count?: number | null
          name?: string | null
          name_ar?: string | null
          type?: string | null
        }
        Relationships: []
      }
      chat_members: {
        Row: {
          channel_id: string
          id: string
          is_muted: boolean | null
          joined_at: string | null
          last_read_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          audio_duration_ms: number | null
          channel_id: string | null
          class_level_id: string
          content_type: string
          created_at: string
          id: string
          is_system: boolean | null
          media_path: string | null
          text: string | null
          user_id: string
        }
        Insert: {
          audio_duration_ms?: number | null
          channel_id?: string | null
          class_level_id: string
          content_type?: string
          created_at?: string
          id?: string
          is_system?: boolean | null
          media_path?: string | null
          text?: string | null
          user_id: string
        }
        Update: {
          audio_duration_ms?: number | null
          channel_id?: string | null
          class_level_id?: string
          content_type?: string
          created_at?: string
          id?: string
          is_system?: boolean | null
          media_path?: string | null
          text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          description_ar: string | null
          id: string
          image_url: string | null
          instructor_bio: string | null
          instructor_name: string | null
          is_published: boolean | null
          level: string | null
          sort_order: number | null
          subject_id: string | null
          title: string
          title_ar: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          id?: string
          image_url?: string | null
          instructor_bio?: string | null
          instructor_name?: string | null
          is_published?: boolean | null
          level?: string | null
          sort_order?: number | null
          subject_id?: string | null
          title: string
          title_ar?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          id?: string
          image_url?: string | null
          instructor_bio?: string | null
          instructor_name?: string | null
          is_published?: boolean | null
          level?: string | null
          sort_order?: number | null
          subject_id?: string | null
          title?: string
          title_ar?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      device_logs: {
        Row: {
          attempt_id: string
          browser: string | null
          created_at: string
          device_type: string | null
          id: string
          ip_address: string | null
          screen_resolution: string | null
          user_agent: string | null
          vpn_detected: boolean | null
        }
        Insert: {
          attempt_id: string
          browser?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          screen_resolution?: string | null
          user_agent?: string | null
          vpn_detected?: boolean | null
        }
        Update: {
          attempt_id?: string
          browser?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          screen_resolution?: string | null
          user_agent?: string | null
          vpn_detected?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "device_logs_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          course_id: string
          enrolled_at: string
          id: string
          progress: number | null
          user_id: string
        }
        Insert: {
          course_id: string
          enrolled_at?: string
          id?: string
          progress?: number | null
          user_id: string
        }
        Update: {
          course_id?: string
          enrolled_at?: string
          id?: string
          progress?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_answers: {
        Row: {
          answer_data: Json | null
          answer_text: string | null
          attempt_id: string
          created_at: string
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          is_correct: boolean | null
          is_flagged: boolean | null
          points_awarded: number | null
          question_id: string
          updated_at: string
        }
        Insert: {
          answer_data?: Json | null
          answer_text?: string | null
          attempt_id: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_correct?: boolean | null
          is_flagged?: boolean | null
          points_awarded?: number | null
          question_id: string
          updated_at?: string
        }
        Update: {
          answer_data?: Json | null
          answer_text?: string | null
          attempt_id?: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_correct?: boolean | null
          is_flagged?: boolean | null
          points_awarded?: number | null
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_assignments: {
        Row: {
          assigned_at: string
          exam_id: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          exam_id: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          exam_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_assignments_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          created_at: string
          exam_id: string
          feedback: string | null
          id: string
          integrity_score: number | null
          passed: boolean | null
          percentage: number | null
          score: number | null
          started_at: string
          status: string | null
          submitted_at: string | null
          suspicion_level: string | null
          tab_switches: number | null
          total_points: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          feedback?: string | null
          id?: string
          integrity_score?: number | null
          passed?: boolean | null
          percentage?: number | null
          score?: number | null
          started_at?: string
          status?: string | null
          submitted_at?: string | null
          suspicion_level?: string | null
          tab_switches?: number | null
          total_points?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          feedback?: string | null
          id?: string
          integrity_score?: number | null
          passed?: boolean | null
          percentage?: number | null
          score?: number | null
          started_at?: string
          status?: string | null
          submitted_at?: string | null
          suspicion_level?: string | null
          tab_switches?: number | null
          total_points?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          correct_answer: string | null
          created_at: string
          difficulty: string | null
          exam_id: string
          explanation: string | null
          explanation_ar: string | null
          id: string
          media_url: string | null
          options: Json | null
          points: number | null
          question_text: string
          question_text_ar: string | null
          question_type: string
          sort_order: number | null
          tags: string[] | null
        }
        Insert: {
          correct_answer?: string | null
          created_at?: string
          difficulty?: string | null
          exam_id: string
          explanation?: string | null
          explanation_ar?: string | null
          id?: string
          media_url?: string | null
          options?: Json | null
          points?: number | null
          question_text: string
          question_text_ar?: string | null
          question_type: string
          sort_order?: number | null
          tags?: string[] | null
        }
        Update: {
          correct_answer?: string | null
          created_at?: string
          difficulty?: string | null
          exam_id?: string
          explanation?: string | null
          explanation_ar?: string | null
          id?: string
          media_url?: string | null
          options?: Json | null
          points?: number | null
          question_text?: string
          question_text_ar?: string | null
          question_type?: string
          sort_order?: number | null
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_review_views: {
        Row: {
          attempt_id: string
          id: string
          user_id: string
          view_count: number | null
          viewed_at: string
        }
        Insert: {
          attempt_id: string
          id?: string
          user_id: string
          view_count?: number | null
          viewed_at?: string
        }
        Update: {
          attempt_id?: string
          id?: string
          user_id?: string
          view_count?: number | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_review_views_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          allow_review: boolean | null
          auto_submit_on_violation: boolean | null
          course_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          description_ar: string | null
          display_mode: string | null
          end_date: string | null
          fullscreen_required: boolean | null
          guidelines: string | null
          guidelines_ar: string | null
          id: string
          is_entrance: boolean | null
          is_published: boolean | null
          max_attempts: number | null
          max_review_views: number | null
          max_warnings: number | null
          passing_score: number | null
          proctoring_enabled: boolean | null
          randomize_answers: boolean | null
          randomize_questions: boolean | null
          record_audio: boolean | null
          record_screen: boolean | null
          record_webcam: boolean | null
          screenshot_interval_seconds: number | null
          show_results_immediately: boolean | null
          start_date: string | null
          tab_switch_limit: number | null
          term: string | null
          time_limit_minutes: number | null
          title: string
          title_ar: string | null
          type: string | null
          updated_at: string
          webcam_required: boolean | null
        }
        Insert: {
          allow_review?: boolean | null
          auto_submit_on_violation?: boolean | null
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          display_mode?: string | null
          end_date?: string | null
          fullscreen_required?: boolean | null
          guidelines?: string | null
          guidelines_ar?: string | null
          id?: string
          is_entrance?: boolean | null
          is_published?: boolean | null
          max_attempts?: number | null
          max_review_views?: number | null
          max_warnings?: number | null
          passing_score?: number | null
          proctoring_enabled?: boolean | null
          randomize_answers?: boolean | null
          randomize_questions?: boolean | null
          record_audio?: boolean | null
          record_screen?: boolean | null
          record_webcam?: boolean | null
          screenshot_interval_seconds?: number | null
          show_results_immediately?: boolean | null
          start_date?: string | null
          tab_switch_limit?: number | null
          term?: string | null
          time_limit_minutes?: number | null
          title: string
          title_ar?: string | null
          type?: string | null
          updated_at?: string
          webcam_required?: boolean | null
        }
        Update: {
          allow_review?: boolean | null
          auto_submit_on_violation?: boolean | null
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          display_mode?: string | null
          end_date?: string | null
          fullscreen_required?: boolean | null
          guidelines?: string | null
          guidelines_ar?: string | null
          id?: string
          is_entrance?: boolean | null
          is_published?: boolean | null
          max_attempts?: number | null
          max_review_views?: number | null
          max_warnings?: number | null
          passing_score?: number | null
          proctoring_enabled?: boolean | null
          randomize_answers?: boolean | null
          randomize_questions?: boolean | null
          record_audio?: boolean | null
          record_screen?: boolean | null
          record_webcam?: boolean | null
          screenshot_interval_seconds?: number | null
          show_results_immediately?: boolean | null
          start_date?: string | null
          tab_switch_limit?: number | null
          term?: string | null
          time_limit_minutes?: number | null
          title?: string
          title_ar?: string | null
          type?: string | null
          updated_at?: string
          webcam_required?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          id: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          course_id: string
          created_at: string | null
          duration_minutes: number | null
          id: string
          sort_order: number | null
          title: string
          title_ar: string | null
          video_url: string | null
        }
        Insert: {
          course_id: string
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          sort_order?: number | null
          title: string
          title_ar?: string | null
          video_url?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          sort_order?: number | null
          title?: string
          title_ar?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      level_courses: {
        Row: {
          id: string
          level: string
          subject_id: string | null
        }
        Insert: {
          id?: string
          level: string
          subject_id?: string | null
        }
        Update: {
          id?: string
          level?: string
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "level_courses_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          chat_count: number | null
          created_at: string | null
          ended_at: string | null
          host_id: string
          id: string
          peak_participants: number | null
          recording_status: string | null
          started_at: string | null
          status: string | null
          subject_id: string
          total_participants: number | null
        }
        Insert: {
          chat_count?: number | null
          created_at?: string | null
          ended_at?: string | null
          host_id: string
          id?: string
          peak_participants?: number | null
          recording_status?: string | null
          started_at?: string | null
          status?: string | null
          subject_id: string
          total_participants?: number | null
        }
        Update: {
          chat_count?: number | null
          created_at?: string | null
          ended_at?: string | null
          host_id?: string
          id?: string
          peak_participants?: number | null
          recording_status?: string | null
          started_at?: string | null
          status?: string | null
          subject_id?: string
          total_participants?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_attendance: {
        Row: {
          created_at: string | null
          date: string
          id: string
          notes: string | null
          session_id: string | null
          status: string | null
          student_id: string
          subject_id: string | null
          teacher_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          notes?: string | null
          session_id?: string | null
          status?: string | null
          student_id: string
          subject_id?: string | null
          teacher_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          notes?: string | null
          session_id?: string | null
          status?: string | null
          student_id?: string
          subject_id?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_attendance_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      private_sessions: {
        Row: {
          created_at: string | null
          end_time: string
          id: string
          notes: string | null
          session_date: string
          start_time: string
          status: string | null
          student_id: string
          subject_id: string | null
          teacher_id: string
        }
        Insert: {
          created_at?: string | null
          end_time: string
          id?: string
          notes?: string | null
          session_date: string
          start_time: string
          status?: string | null
          student_id: string
          subject_id?: string | null
          teacher_id: string
        }
        Update: {
          created_at?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          session_date?: string
          start_time?: string
          status?: string | null
          student_id?: string
          subject_id?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_sessions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      proctoring_media: {
        Row: {
          attempt_id: string
          created_at: string
          duration_seconds: number | null
          file_name: string | null
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          metadata: Json | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          duration_seconds?: number | null
          file_name?: string | null
          file_size?: number | null
          file_type: string
          file_url: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          duration_seconds?: number | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "proctoring_media_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      proctoring_sessions: {
        Row: {
          attempt_id: string
          ended_at: string | null
          fullscreen_active: boolean | null
          id: string
          integrity_score: number | null
          max_warnings: number | null
          microphone_enabled: boolean | null
          started_at: string
          suspicion_level: string | null
          total_violations: number | null
          updated_at: string
          warnings_issued: number | null
          webcam_enabled: boolean | null
        }
        Insert: {
          attempt_id: string
          ended_at?: string | null
          fullscreen_active?: boolean | null
          id?: string
          integrity_score?: number | null
          max_warnings?: number | null
          microphone_enabled?: boolean | null
          started_at?: string
          suspicion_level?: string | null
          total_violations?: number | null
          updated_at?: string
          warnings_issued?: number | null
          webcam_enabled?: boolean | null
        }
        Update: {
          attempt_id?: string
          ended_at?: string | null
          fullscreen_active?: boolean | null
          id?: string
          integrity_score?: number | null
          max_warnings?: number | null
          microphone_enabled?: boolean | null
          started_at?: string
          suspicion_level?: string | null
          total_violations?: number | null
          updated_at?: string
          warnings_issued?: number | null
          webcam_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "proctoring_sessions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_group: string | null
          allow_entrance_retake: boolean | null
          assigned_teacher_id: string | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          enrollment_date: string | null
          entrance_completed_at: string | null
          full_name: string | null
          full_name_ar: string | null
          gender: string | null
          has_taken_entrance_exam: boolean | null
          id: string
          learning_goal: string | null
          level: string | null
          nationality: string | null
          onboarding_completed: boolean | null
          parent_name: string | null
          parent_phone: string | null
          parent_relationship: string | null
          parent_whatsapp: string | null
          phone: string | null
          preferred_language: string | null
          private_notes: string | null
          private_session_rate: string | null
          status: string | null
          student_id: string | null
          student_type: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          age_group?: string | null
          allow_entrance_retake?: boolean | null
          assigned_teacher_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          enrollment_date?: string | null
          entrance_completed_at?: string | null
          full_name?: string | null
          full_name_ar?: string | null
          gender?: string | null
          has_taken_entrance_exam?: boolean | null
          id?: string
          learning_goal?: string | null
          level?: string | null
          nationality?: string | null
          onboarding_completed?: boolean | null
          parent_name?: string | null
          parent_phone?: string | null
          parent_relationship?: string | null
          parent_whatsapp?: string | null
          phone?: string | null
          preferred_language?: string | null
          private_notes?: string | null
          private_session_rate?: string | null
          status?: string | null
          student_id?: string | null
          student_type?: string | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          age_group?: string | null
          allow_entrance_retake?: boolean | null
          assigned_teacher_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          enrollment_date?: string | null
          entrance_completed_at?: string | null
          full_name?: string | null
          full_name_ar?: string | null
          gender?: string | null
          has_taken_entrance_exam?: boolean | null
          id?: string
          learning_goal?: string | null
          level?: string | null
          nationality?: string | null
          onboarding_completed?: boolean | null
          parent_name?: string | null
          parent_phone?: string | null
          parent_relationship?: string | null
          parent_whatsapp?: string | null
          phone?: string | null
          preferred_language?: string | null
          private_notes?: string | null
          private_session_rate?: string | null
          status?: string | null
          student_id?: string | null
          student_type?: string | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      session_chat: {
        Row: {
          created_at: string | null
          id: string
          is_teacher_only: boolean | null
          message: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_teacher_only?: boolean | null
          message: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_teacher_only?: boolean | null
          message?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_chat_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_recordings: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          file_size: number | null
          file_url: string | null
          id: string
          session_id: string
          subject_id: string
          teacher_name: string | null
          thumbnail_url: string | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          session_id: string
          subject_id: string
          teacher_name?: string | null
          thumbnail_url?: string | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          session_id?: string
          subject_id?: string
          teacher_name?: string | null
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_recordings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_recordings_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      student_preferences: {
        Row: {
          autoplay_recordings: boolean | null
          class_reminder: boolean | null
          class_reminder_minutes: number | null
          created_at: string | null
          dark_mode: boolean | null
          default_subject_view: string | null
          email_notifications: boolean | null
          exam_reminder: boolean | null
          id: string
          language: string | null
          new_recording_alert: boolean | null
          playback_speed: string | null
          results_notification: boolean | null
          show_profile_photo: boolean | null
          show_subtitles: boolean | null
          text_direction: string | null
          updated_at: string | null
          user_id: string
          whatsapp_notifications: boolean | null
        }
        Insert: {
          autoplay_recordings?: boolean | null
          class_reminder?: boolean | null
          class_reminder_minutes?: number | null
          created_at?: string | null
          dark_mode?: boolean | null
          default_subject_view?: string | null
          email_notifications?: boolean | null
          exam_reminder?: boolean | null
          id?: string
          language?: string | null
          new_recording_alert?: boolean | null
          playback_speed?: string | null
          results_notification?: boolean | null
          show_profile_photo?: boolean | null
          show_subtitles?: boolean | null
          text_direction?: string | null
          updated_at?: string | null
          user_id: string
          whatsapp_notifications?: boolean | null
        }
        Update: {
          autoplay_recordings?: boolean | null
          class_reminder?: boolean | null
          class_reminder_minutes?: number | null
          created_at?: string | null
          dark_mode?: boolean | null
          default_subject_view?: string | null
          email_notifications?: boolean | null
          exam_reminder?: boolean | null
          id?: string
          language?: string | null
          new_recording_alert?: boolean | null
          playback_speed?: string | null
          results_notification?: boolean | null
          show_profile_photo?: boolean | null
          show_subtitles?: boolean | null
          text_direction?: string | null
          updated_at?: string | null
          user_id?: string
          whatsapp_notifications?: boolean | null
        }
        Relationships: []
      }
      subject_announcements: {
        Row: {
          content: string
          created_at: string | null
          created_by: string
          file_url: string | null
          id: string
          is_pinned: boolean | null
          subject_id: string
          title: string
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by: string
          file_url?: string | null
          id?: string
          is_pinned?: boolean | null
          subject_id: string
          title: string
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string
          file_url?: string | null
          id?: string
          is_pinned?: boolean | null
          subject_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_announcements_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_assignments: {
        Row: {
          created_at: string | null
          created_by: string
          deadline: string | null
          description: string | null
          file_url: string | null
          id: string
          subject_id: string
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          deadline?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          subject_id: string
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          deadline?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          subject_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_materials: {
        Row: {
          content: string | null
          created_at: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          is_downloadable: boolean | null
          level: string | null
          material_type: string | null
          sort_order: number | null
          subject_id: string
          title: string
          topic: string | null
          uploaded_by: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          is_downloadable?: boolean | null
          level?: string | null
          material_type?: string | null
          sort_order?: number | null
          subject_id: string
          title: string
          topic?: string | null
          uploaded_by: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          is_downloadable?: boolean | null
          level?: string | null
          material_type?: string | null
          sort_order?: number | null
          subject_id?: string
          title?: string
          topic?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_materials_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_syllabus: {
        Row: {
          created_at: string | null
          description: string | null
          file_url: string | null
          id: string
          level: string | null
          objectives: string[] | null
          subject_id: string
          title: string
          week_number: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          level?: string | null
          objectives?: string[] | null
          subject_id: string
          title: string
          week_number?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          level?: string | null
          objectives?: string[] | null
          subject_id?: string
          title?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subject_syllabus_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          description_ar: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          livekit_room_name: string | null
          teacher_id: string | null
          title: string
          title_ar: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          livekit_room_name?: string | null
          teacher_id?: string | null
          title: string
          title_ar?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          livekit_room_name?: string | null
          teacher_id?: string | null
          title?: string
          title_ar?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      teacher_announcements: {
        Row: {
          created_at: string | null
          id: string
          message: string
          priority: string | null
          target_id: string | null
          target_type: string | null
          teacher_id: string
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          priority?: string | null
          target_id?: string | null
          target_type?: string | null
          teacher_id: string
          title: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          priority?: string | null
          target_id?: string | null
          target_type?: string | null
          teacher_id?: string
          title?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      violations: {
        Row: {
          attempt_id: string
          details: string | null
          id: string
          screenshot_url: string | null
          severity_score: number
          timestamp: string
          violation_type: string
        }
        Insert: {
          attempt_id: string
          details?: string | null
          id?: string
          screenshot_url?: string | null
          severity_score?: number
          timestamp?: string
          violation_type: string
        }
        Update: {
          attempt_id?: string
          details?: string | null
          id?: string
          screenshot_url?: string | null
          severity_score?: number
          timestamp?: string
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "violations_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_exam_questions_for_review: {
        Args: { _attempt_id: string }
        Returns: {
          correct_answer: string
          difficulty: string
          exam_id: string
          explanation: string
          explanation_ar: string
          id: string
          media_url: string
          options: Json
          points: number
          question_text: string
          question_text_ar: string
          question_type: string
          sort_order: number
        }[]
      }
      get_exam_questions_for_student: {
        Args: { _exam_id: string }
        Returns: {
          difficulty: string
          exam_id: string
          explanation: string
          explanation_ar: string
          id: string
          media_url: string
          options: Json
          points: number
          question_text: string
          question_text_ar: string
          question_type: string
          sort_order: number
        }[]
      }
      grade_exam_attempt: { Args: { _attempt_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "student"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "teacher", "student"],
    },
  },
} as const
