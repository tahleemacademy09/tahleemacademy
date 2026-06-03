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
      academic_calendar: {
        Row: {
          academic_year: string
          created_at: string | null
          created_by: string | null
          holiday_reason: string | null
          holiday_reason_ar: string | null
          id: string
          is_active: boolean | null
          is_holiday: boolean | null
          payment_due_date: string | null
          resume_date: string
          term: string
          term_end_date: string
          term_start_date: string
          title: string
          title_ar: string | null
        }
        Insert: {
          academic_year: string
          created_at?: string | null
          created_by?: string | null
          holiday_reason?: string | null
          holiday_reason_ar?: string | null
          id?: string
          is_active?: boolean | null
          is_holiday?: boolean | null
          payment_due_date?: string | null
          resume_date: string
          term: string
          term_end_date: string
          term_start_date: string
          title: string
          title_ar?: string | null
        }
        Update: {
          academic_year?: string
          created_at?: string | null
          created_by?: string | null
          holiday_reason?: string | null
          holiday_reason_ar?: string | null
          id?: string
          is_active?: boolean | null
          is_holiday?: boolean | null
          payment_due_date?: string | null
          resume_date?: string
          term?: string
          term_end_date?: string
          term_start_date?: string
          title?: string
          title_ar?: string | null
        }
        Relationships: []
      }
      academic_events: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          event_type: string
          id: string
          notify_to: string
          subject_id: string | null
          time_end: string | null
          time_start: string | null
          title: string
          title_ar: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          description?: string | null
          event_type?: string
          id?: string
          notify_to?: string
          subject_id?: string | null
          time_end?: string | null
          time_start?: string | null
          title: string
          title_ar?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          event_type?: string
          id?: string
          notify_to?: string
          subject_id?: string | null
          time_end?: string | null
          time_start?: string | null
          title?: string
          title_ar?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_events_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_levels: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      academy_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
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
      admin_notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          read: boolean | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          read?: boolean | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          read?: boolean | null
          type?: string
          user_id?: string | null
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
          created_by_name: string | null
          description: string | null
          icon_url: string | null
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
          created_by_name?: string | null
          description?: string | null
          icon_url?: string | null
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
          created_by_name?: string | null
          description?: string | null
          icon_url?: string | null
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
          is_online: boolean | null
          joined_at: string | null
          last_read_at: string | null
          last_seen: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          is_muted?: boolean | null
          is_online?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          last_seen?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          is_muted?: boolean | null
          is_online?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          last_seen?: string | null
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
          deleted_by: string | null
          deleted_reason: string | null
          duration_ms: number | null
          edited_at: string | null
          edited_by: string | null
          id: string
          is_broadcast: boolean | null
          is_deleted: boolean | null
          is_flagged: boolean | null
          is_pinned: boolean | null
          is_starred: boolean | null
          is_system: boolean | null
          media_path: string | null
          media_type: string | null
          media_url: string | null
          original_text: string | null
          reply_preview: string | null
          reply_to_id: string | null
          seen_by: string[] | null
          text: string | null
          user_id: string
        }
        Insert: {
          audio_duration_ms?: number | null
          channel_id?: string | null
          class_level_id: string
          content_type?: string
          created_at?: string
          deleted_by?: string | null
          deleted_reason?: string | null
          duration_ms?: number | null
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          is_broadcast?: boolean | null
          is_deleted?: boolean | null
          is_flagged?: boolean | null
          is_pinned?: boolean | null
          is_starred?: boolean | null
          is_system?: boolean | null
          media_path?: string | null
          media_type?: string | null
          media_url?: string | null
          original_text?: string | null
          reply_preview?: string | null
          reply_to_id?: string | null
          seen_by?: string[] | null
          text?: string | null
          user_id: string
        }
        Update: {
          audio_duration_ms?: number | null
          channel_id?: string | null
          class_level_id?: string
          content_type?: string
          created_at?: string
          deleted_by?: string | null
          deleted_reason?: string | null
          duration_ms?: number | null
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          is_broadcast?: boolean | null
          is_deleted?: boolean | null
          is_flagged?: boolean | null
          is_pinned?: boolean | null
          is_starred?: boolean | null
          is_system?: boolean | null
          media_path?: string | null
          media_type?: string | null
          media_url?: string | null
          original_text?: string | null
          reply_preview?: string | null
          reply_to_id?: string | null
          seen_by?: string[] | null
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
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      class_chat_messages: {
        Row: {
          created_at: string | null
          file_url: string | null
          id: string
          is_pinned: boolean | null
          message: string
          sender_id: string
          session_id: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          file_url?: string | null
          id?: string
          is_pinned?: boolean | null
          message: string
          sender_id: string
          session_id?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          file_url?: string | null
          id?: string
          is_pinned?: boolean | null
          message?: string
          sender_id?: string
          session_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      class_participants: {
        Row: {
          camera_on: boolean | null
          duration_minutes: number | null
          hand_raised: boolean | null
          hand_raised_at: string | null
          id: string
          is_muted: boolean | null
          joined_at: string | null
          left_at: string | null
          session_id: string | null
          student_id: string
        }
        Insert: {
          camera_on?: boolean | null
          duration_minutes?: number | null
          hand_raised?: boolean | null
          hand_raised_at?: string | null
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          session_id?: string | null
          student_id: string
        }
        Update: {
          camera_on?: boolean | null
          duration_minutes?: number | null
          hand_raised?: boolean | null
          hand_raised_at?: string | null
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          session_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      class_poll_answers: {
        Row: {
          answer_index: number
          created_at: string | null
          id: string
          poll_id: string | null
          student_id: string
        }
        Insert: {
          answer_index: number
          created_at?: string | null
          id?: string
          poll_id?: string | null
          student_id: string
        }
        Update: {
          answer_index?: number
          created_at?: string | null
          id?: string
          poll_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_poll_answers_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "class_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      class_polls: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          options: Json
          question: string
          session_id: string | null
          show_results: boolean | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          options: Json
          question: string
          session_id?: string | null
          show_results?: boolean | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          options?: Json
          question?: string
          session_id?: string | null
          show_results?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "class_polls_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      class_quiz_live: {
        Row: {
          correct_answer: number
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          options: Json
          question: string
          session_id: string | null
          time_limit_seconds: number | null
        }
        Insert: {
          correct_answer: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          options: Json
          question: string
          session_id?: string | null
          time_limit_seconds?: number | null
        }
        Update: {
          correct_answer?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          options?: Json
          question?: string
          session_id?: string | null
          time_limit_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "class_quiz_live_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          message: string | null
          name: string | null
          subject: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          message?: string | null
          name?: string | null
          subject?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          message?: string | null
          name?: string | null
          subject?: string | null
        }
        Relationships: []
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
          visibility: string
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
          visibility?: string
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
          visibility?: string
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
      dashboards: {
        Row: {
          created_at: string | null
          id: string
          last_seen_at: string | null
          preferences: Json | null
          updated_at: string | null
          user_id: string
          widgets: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_seen_at?: string | null
          preferences?: Json | null
          updated_at?: string | null
          user_id: string
          widgets?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_seen_at?: string | null
          preferences?: Json | null
          updated_at?: string | null
          user_id?: string
          widgets?: Json | null
        }
        Relationships: []
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
      email_reminder_logs: {
        Row: {
          class_id: string | null
          created_at: string
          email: string
          id: string
          registration_id: string | null
          sent_at: string
          subject: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          email: string
          id?: string
          registration_id?: string | null
          sent_at?: string
          subject?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string
          email?: string
          id?: string
          registration_id?: string | null
          sent_at?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_reminder_logs_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "public_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_reminder_logs_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "public_class_registrations"
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
          registration_paid: boolean | null
          registration_paid_at: string | null
          user_id: string
        }
        Insert: {
          course_id: string
          enrolled_at?: string
          id?: string
          progress?: number | null
          registration_paid?: boolean | null
          registration_paid_at?: string | null
          user_id: string
        }
        Update: {
          course_id?: string
          enrolled_at?: string
          id?: string
          progress?: number | null
          registration_paid?: boolean | null
          registration_paid_at?: string | null
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
          answer: Json | null
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
          answer?: Json | null
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
          answer?: Json | null
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
          allow_retake: boolean | null
          assigned_at: string
          assigned_by: string | null
          assigned_round: number | null
          exam_id: string
          id: string
          user_id: string
        }
        Insert: {
          allow_retake?: boolean | null
          assigned_at?: string
          assigned_by?: string | null
          assigned_round?: number | null
          exam_id: string
          id?: string
          user_id: string
        }
        Update: {
          allow_retake?: boolean | null
          assigned_at?: string
          assigned_by?: string | null
          assigned_round?: number | null
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
          results_released_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score: number | null
          started_at: string
          status: string | null
          submitted_at: string | null
          suspicion_level: string | null
          tab_switches: number | null
          total_points: number | null
          updated_at: string | null
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
          results_released_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          started_at?: string
          status?: string | null
          submitted_at?: string | null
          suspicion_level?: string | null
          tab_switches?: number | null
          total_points?: number | null
          updated_at?: string | null
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
          results_released_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          started_at?: string
          status?: string | null
          submitted_at?: string | null
          suspicion_level?: string | null
          tab_switches?: number | null
          total_points?: number | null
          updated_at?: string | null
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
      exam_format_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          settings: Json
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          settings: Json
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          settings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "exam_format_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          accepted_answers: Json | null
          audio_response_type: string | null
          background_image: string | null
          case_sensitive: boolean | null
          correct_answer: string | null
          created_at: string
          custom_format: Json | null
          difficulty: string | null
          exam_id: string
          explanation: string | null
          explanation_ar: string | null
          feedback_incorrect: string | null
          id: string
          marks: number | null
          matching_pairs: Json | null
          max_words: number | null
          media_url: string | null
          metadata: Json | null
          min_words: number | null
          options: Json | null
          ordering_items: Json | null
          partial_credit: boolean | null
          points: number | null
          question_text: string
          question_text_ar: string | null
          question_timer_seconds: number | null
          question_type: string
          sort_order: number | null
          tags: string[] | null
        }
        Insert: {
          accepted_answers?: Json | null
          audio_response_type?: string | null
          background_image?: string | null
          case_sensitive?: boolean | null
          correct_answer?: string | null
          created_at?: string
          custom_format?: Json | null
          difficulty?: string | null
          exam_id: string
          explanation?: string | null
          explanation_ar?: string | null
          feedback_incorrect?: string | null
          id?: string
          marks?: number | null
          matching_pairs?: Json | null
          max_words?: number | null
          media_url?: string | null
          metadata?: Json | null
          min_words?: number | null
          options?: Json | null
          ordering_items?: Json | null
          partial_credit?: boolean | null
          points?: number | null
          question_text: string
          question_text_ar?: string | null
          question_timer_seconds?: number | null
          question_type?: string
          sort_order?: number | null
          tags?: string[] | null
        }
        Update: {
          accepted_answers?: Json | null
          audio_response_type?: string | null
          background_image?: string | null
          case_sensitive?: boolean | null
          correct_answer?: string | null
          created_at?: string
          custom_format?: Json | null
          difficulty?: string | null
          exam_id?: string
          explanation?: string | null
          explanation_ar?: string | null
          feedback_incorrect?: string | null
          id?: string
          marks?: number | null
          matching_pairs?: Json | null
          max_words?: number | null
          media_url?: string | null
          metadata?: Json | null
          min_words?: number | null
          options?: Json | null
          ordering_items?: Json | null
          partial_credit?: boolean | null
          points?: number | null
          question_text?: string
          question_text_ar?: string | null
          question_timer_seconds?: number | null
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
          blur_detection: boolean | null
          course_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          description_ar: string | null
          display_mode: string | null
          end_date: string | null
          face_detection: boolean | null
          fullscreen_required: boolean | null
          guidelines: string | null
          guidelines_ar: string | null
          id: string
          idle_timeout_seconds: number | null
          is_active: boolean | null
          is_entrance: boolean | null
          is_published: boolean | null
          level: string | null
          max_attempts: number | null
          max_review_views: number | null
          max_score: number | null
          max_warnings: number | null
          mic_required: boolean | null
          options_alignment: string | null
          options_bold: boolean | null
          options_font_size: number | null
          passing_score: number | null
          proctoring_enabled: boolean | null
          question_alignment: string | null
          question_bold: boolean | null
          question_color: string | null
          question_font_family: string | null
          question_font_size: number | null
          question_italic: boolean | null
          question_line_height: number | null
          question_padding: number | null
          randomize_answers: boolean | null
          randomize_questions: boolean | null
          record_audio: boolean | null
          record_screen: boolean | null
          record_webcam: boolean | null
          rtl_mode: boolean | null
          screenshot_interval_seconds: number | null
          show_marks_per_question: boolean | null
          show_question_numbers: boolean | null
          show_results_immediately: boolean | null
          start_date: string | null
          tab_switch_limit: number | null
          term: string | null
          time_limit_minutes: number | null
          timezone: string | null
          title: string
          title_ar: string | null
          type: string | null
          updated_at: string
          webcam_required: boolean | null
        }
        Insert: {
          allow_review?: boolean | null
          auto_submit_on_violation?: boolean | null
          blur_detection?: boolean | null
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          display_mode?: string | null
          end_date?: string | null
          face_detection?: boolean | null
          fullscreen_required?: boolean | null
          guidelines?: string | null
          guidelines_ar?: string | null
          id?: string
          idle_timeout_seconds?: number | null
          is_active?: boolean | null
          is_entrance?: boolean | null
          is_published?: boolean | null
          level?: string | null
          max_attempts?: number | null
          max_review_views?: number | null
          max_score?: number | null
          max_warnings?: number | null
          mic_required?: boolean | null
          options_alignment?: string | null
          options_bold?: boolean | null
          options_font_size?: number | null
          passing_score?: number | null
          proctoring_enabled?: boolean | null
          question_alignment?: string | null
          question_bold?: boolean | null
          question_color?: string | null
          question_font_family?: string | null
          question_font_size?: number | null
          question_italic?: boolean | null
          question_line_height?: number | null
          question_padding?: number | null
          randomize_answers?: boolean | null
          randomize_questions?: boolean | null
          record_audio?: boolean | null
          record_screen?: boolean | null
          record_webcam?: boolean | null
          rtl_mode?: boolean | null
          screenshot_interval_seconds?: number | null
          show_marks_per_question?: boolean | null
          show_question_numbers?: boolean | null
          show_results_immediately?: boolean | null
          start_date?: string | null
          tab_switch_limit?: number | null
          term?: string | null
          time_limit_minutes?: number | null
          timezone?: string | null
          title: string
          title_ar?: string | null
          type?: string | null
          updated_at?: string
          webcam_required?: boolean | null
        }
        Update: {
          allow_review?: boolean | null
          auto_submit_on_violation?: boolean | null
          blur_detection?: boolean | null
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          display_mode?: string | null
          end_date?: string | null
          face_detection?: boolean | null
          fullscreen_required?: boolean | null
          guidelines?: string | null
          guidelines_ar?: string | null
          id?: string
          idle_timeout_seconds?: number | null
          is_active?: boolean | null
          is_entrance?: boolean | null
          is_published?: boolean | null
          level?: string | null
          max_attempts?: number | null
          max_review_views?: number | null
          max_score?: number | null
          max_warnings?: number | null
          mic_required?: boolean | null
          options_alignment?: string | null
          options_bold?: boolean | null
          options_font_size?: number | null
          passing_score?: number | null
          proctoring_enabled?: boolean | null
          question_alignment?: string | null
          question_bold?: boolean | null
          question_color?: string | null
          question_font_family?: string | null
          question_font_size?: number | null
          question_italic?: boolean | null
          question_line_height?: number | null
          question_padding?: number | null
          randomize_answers?: boolean | null
          randomize_questions?: boolean | null
          record_audio?: boolean | null
          record_screen?: boolean | null
          record_webcam?: boolean | null
          rtl_mode?: boolean | null
          screenshot_interval_seconds?: number | null
          show_marks_per_question?: boolean | null
          show_question_numbers?: boolean | null
          show_results_immediately?: boolean | null
          start_date?: string | null
          tab_switch_limit?: number | null
          term?: string | null
          time_limit_minutes?: number | null
          timezone?: string | null
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
      hifdh_ai_chat: {
        Row: {
          created_at: string | null
          id: string
          message: string
          message_ar: string | null
          sender_id: string | null
          sender_type: string | null
          session_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          message_ar?: string | null
          sender_id?: string | null
          sender_type?: string | null
          session_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          message_ar?: string | null
          sender_id?: string | null
          sender_type?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hifdh_ai_chat_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      hifdh_ai_corrections: {
        Row: {
          ai_suggestion: string | null
          ayah: number | null
          correct_text: string | null
          created_at: string | null
          error_type: string | null
          id: string
          is_resolved: boolean | null
          session_id: string | null
          severity: string | null
          student_id: string | null
          student_text: string | null
          surah: string | null
        }
        Insert: {
          ai_suggestion?: string | null
          ayah?: number | null
          correct_text?: string | null
          created_at?: string | null
          error_type?: string | null
          id?: string
          is_resolved?: boolean | null
          session_id?: string | null
          severity?: string | null
          student_id?: string | null
          student_text?: string | null
          surah?: string | null
        }
        Update: {
          ai_suggestion?: string | null
          ayah?: number | null
          correct_text?: string | null
          created_at?: string | null
          error_type?: string | null
          id?: string
          is_resolved?: boolean | null
          session_id?: string | null
          severity?: string | null
          student_id?: string | null
          student_text?: string | null
          surah?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hifdh_ai_corrections_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      hifdh_assignments: {
        Row: {
          active: boolean | null
          assigned_by: string
          created_at: string | null
          daily_pages: number | null
          id: string
          mode: string
          notes: string | null
          reciter: string | null
          selected: number[]
          student_id: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          assigned_by: string
          created_at?: string | null
          daily_pages?: number | null
          id?: string
          mode: string
          notes?: string | null
          reciter?: string | null
          selected: number[]
          student_id: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          assigned_by?: string
          created_at?: string | null
          daily_pages?: number | null
          id?: string
          mode?: string
          notes?: string | null
          reciter?: string | null
          selected?: number[]
          student_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      hifdh_custom_voices: {
        Row: {
          created_at: string | null
          file_path: string
          id: string
          name: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          file_path: string
          id?: string
          name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          file_path?: string
          id?: string
          name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      hifdh_daily_assignments: {
        Row: {
          active: boolean
          assigned_by: string
          auto_progress: boolean | null
          created_at: string
          current_position: Json | null
          daily_pages: number
          days_completed: number | null
          id: string
          last_advance_date: string | null
          mode: string
          notes: string | null
          program_days: number | null
          program_duration_days: number | null
          program_start_date: string | null
          reciter_id: string
          rest_days: number[] | null
          selected_items: number[]
          start_page: number | null
          starts_on: string
          student_id: string
          target_scope: string | null
          target_value: string | null
          updated_at: string
          weekend_off: boolean | null
        }
        Insert: {
          active?: boolean
          assigned_by: string
          auto_progress?: boolean | null
          created_at?: string
          current_position?: Json | null
          daily_pages?: number
          days_completed?: number | null
          id?: string
          last_advance_date?: string | null
          mode: string
          notes?: string | null
          program_days?: number | null
          program_duration_days?: number | null
          program_start_date?: string | null
          reciter_id?: string
          rest_days?: number[] | null
          selected_items?: number[]
          start_page?: number | null
          starts_on?: string
          student_id: string
          target_scope?: string | null
          target_value?: string | null
          updated_at?: string
          weekend_off?: boolean | null
        }
        Update: {
          active?: boolean
          assigned_by?: string
          auto_progress?: boolean | null
          created_at?: string
          current_position?: Json | null
          daily_pages?: number
          days_completed?: number | null
          id?: string
          last_advance_date?: string | null
          mode?: string
          notes?: string | null
          program_days?: number | null
          program_duration_days?: number | null
          program_start_date?: string | null
          reciter_id?: string
          rest_days?: number[] | null
          selected_items?: number[]
          start_page?: number | null
          starts_on?: string
          student_id?: string
          target_scope?: string | null
          target_value?: string | null
          updated_at?: string
          weekend_off?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "hifdh_daily_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hifdh_daily_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      hifdh_daily_logs: {
        Row: {
          ack_note: string | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          assignment_id: string | null
          avg_score: number | null
          completed: boolean
          created_at: string
          duration_secs: number | null
          id: string
          log_date: string
          pages_revised: number
          session_data: Json | null
          student_id: string
        }
        Insert: {
          ack_note?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assignment_id?: string | null
          avg_score?: number | null
          completed?: boolean
          created_at?: string
          duration_secs?: number | null
          id?: string
          log_date?: string
          pages_revised?: number
          session_data?: Json | null
          student_id: string
        }
        Update: {
          ack_note?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assignment_id?: string | null
          avg_score?: number | null
          completed?: boolean
          created_at?: string
          duration_secs?: number | null
          id?: string
          log_date?: string
          pages_revised?: number
          session_data?: Json | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hifdh_daily_logs_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hifdh_daily_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "hifdh_daily_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hifdh_daily_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      hifdh_daily_tasks: {
        Row: {
          completed: boolean | null
          created_at: string | null
          id: string
          surah_name: string | null
          target_date: string | null
          task_type: string | null
          user_id: string | null
          verses_count: number | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          id?: string
          surah_name?: string | null
          target_date?: string | null
          task_type?: string | null
          user_id?: string | null
          verses_count?: number | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          id?: string
          surah_name?: string | null
          target_date?: string | null
          task_type?: string | null
          user_id?: string | null
          verses_count?: number | null
        }
        Relationships: []
      }
      hifdh_page_logs: {
        Row: {
          acknowledged_at: string | null
          assignment_id: string | null
          attempts: number | null
          created_at: string | null
          date: string
          duration_seconds: number | null
          error_count: number | null
          exercise_score: number | null
          id: string
          page_number: number
          score: number | null
          status: string | null
          student_id: string
          teacher_acknowledged: boolean | null
          teacher_feedback: string | null
          teacher_id: string | null
          transcript: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          assignment_id?: string | null
          attempts?: number | null
          created_at?: string | null
          date?: string
          duration_seconds?: number | null
          error_count?: number | null
          exercise_score?: number | null
          id?: string
          page_number: number
          score?: number | null
          status?: string | null
          student_id: string
          teacher_acknowledged?: boolean | null
          teacher_feedback?: string | null
          teacher_id?: string | null
          transcript?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          assignment_id?: string | null
          attempts?: number | null
          created_at?: string | null
          date?: string
          duration_seconds?: number | null
          error_count?: number | null
          exercise_score?: number | null
          id?: string
          page_number?: number
          score?: number | null
          status?: string | null
          student_id?: string
          teacher_acknowledged?: boolean | null
          teacher_feedback?: string | null
          teacher_id?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hifdh_page_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "hifdh_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      hifdh_plans: {
        Row: {
          assigned_by: string | null
          ayah_end: number | null
          ayah_start: number | null
          created_at: string | null
          current_juz: number | null
          daily_target_ayahs: number | null
          difficulty: string | null
          id: string
          max_ayahs_override: number | null
          notes: string | null
          revision_mode: string | null
          student_id: string | null
          surah_number: number | null
          surah_rotation: Json | null
          teacher_locked: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_by?: string | null
          ayah_end?: number | null
          ayah_start?: number | null
          created_at?: string | null
          current_juz?: number | null
          daily_target_ayahs?: number | null
          difficulty?: string | null
          id?: string
          max_ayahs_override?: number | null
          notes?: string | null
          revision_mode?: string | null
          student_id?: string | null
          surah_number?: number | null
          surah_rotation?: Json | null
          teacher_locked?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_by?: string | null
          ayah_end?: number | null
          ayah_start?: number | null
          created_at?: string | null
          current_juz?: number | null
          daily_target_ayahs?: number | null
          difficulty?: string | null
          id?: string
          max_ayahs_override?: number | null
          notes?: string | null
          revision_mode?: string | null
          student_id?: string | null
          surah_number?: number | null
          surah_rotation?: Json | null
          teacher_locked?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      hifdh_progress: {
        Row: {
          best_accuracy: number | null
          id: string
          last_reviewed: string | null
          surah_name: string | null
          surah_num: number | null
          times_reviewed: number | null
          user_id: string | null
        }
        Insert: {
          best_accuracy?: number | null
          id?: string
          last_reviewed?: string | null
          surah_name?: string | null
          surah_num?: number | null
          times_reviewed?: number | null
          user_id?: string | null
        }
        Update: {
          best_accuracy?: number | null
          id?: string
          last_reviewed?: string | null
          surah_name?: string | null
          surah_num?: number | null
          times_reviewed?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      hifdh_recordings: {
        Row: {
          admin_feedback: string | null
          admin_id: string | null
          admin_reviewed_at: string | null
          admin_score: number | null
          ai_score: number | null
          audio_url: string | null
          ayah_end: number | null
          ayah_start: number | null
          correct: number | null
          created_at: string | null
          duration: number | null
          id: string
          status: string | null
          student_id: string | null
          surah_name: string | null
          surah_num: number | null
          transcript: string | null
          word_results: Json | null
          wrong: number | null
        }
        Insert: {
          admin_feedback?: string | null
          admin_id?: string | null
          admin_reviewed_at?: string | null
          admin_score?: number | null
          ai_score?: number | null
          audio_url?: string | null
          ayah_end?: number | null
          ayah_start?: number | null
          correct?: number | null
          created_at?: string | null
          duration?: number | null
          id?: string
          status?: string | null
          student_id?: string | null
          surah_name?: string | null
          surah_num?: number | null
          transcript?: string | null
          word_results?: Json | null
          wrong?: number | null
        }
        Update: {
          admin_feedback?: string | null
          admin_id?: string | null
          admin_reviewed_at?: string | null
          admin_score?: number | null
          ai_score?: number | null
          audio_url?: string | null
          ayah_end?: number | null
          ayah_start?: number | null
          correct?: number | null
          created_at?: string | null
          duration?: number | null
          id?: string
          status?: string | null
          student_id?: string | null
          surah_name?: string | null
          surah_num?: number | null
          transcript?: string | null
          word_results?: Json | null
          wrong?: number | null
        }
        Relationships: []
      }
      hifdh_revision_plans: {
        Row: {
          all_pages: Json
          created_at: string | null
          current_idx: number
          daily_pages: number
          id: string
          is_active: boolean
          selected_items: Json
          selection_mode: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          all_pages?: Json
          created_at?: string | null
          current_idx?: number
          daily_pages?: number
          id?: string
          is_active?: boolean
          selected_items?: Json
          selection_mode: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          all_pages?: Json
          created_at?: string | null
          current_idx?: number
          daily_pages?: number
          id?: string
          is_active?: boolean
          selected_items?: Json
          selection_mode?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      hifdh_revision_progress: {
        Row: {
          attempts: number
          best_score: number
          completed: boolean
          completed_at: string | null
          created_at: string | null
          exercise_score: number
          id: string
          page_number: number
          plan_id: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          best_score?: number
          completed?: boolean
          completed_at?: string | null
          created_at?: string | null
          exercise_score?: number
          id?: string
          page_number: number
          plan_id?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          best_score?: number
          completed?: boolean
          completed_at?: string | null
          created_at?: string | null
          exercise_score?: number
          id?: string
          page_number?: number
          plan_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hifdh_revision_progress_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "hifdh_revision_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      hifdh_revision_sessions: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          id: string
          page_number: number
          score: number
          stage: string
          transcript: string | null
          user_id: string
          word_results: Json
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          page_number: number
          score?: number
          stage?: string
          transcript?: string | null
          user_id: string
          word_results?: Json
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          page_number?: number
          score?: number
          stage?: string
          transcript?: string | null
          user_id?: string
          word_results?: Json
        }
        Relationships: []
      }
      hifdh_session_participants: {
        Row: {
          ai_feedback: string | null
          ai_score: number | null
          audio_url: string | null
          errors_detected: Json | null
          final_score: number | null
          id: string
          is_approved: boolean | null
          joined_at: string | null
          left_at: string | null
          pages_assigned: string | null
          session_id: string | null
          student_id: string | null
          teacher_feedback: string | null
          teacher_score: number | null
        }
        Insert: {
          ai_feedback?: string | null
          ai_score?: number | null
          audio_url?: string | null
          errors_detected?: Json | null
          final_score?: number | null
          id?: string
          is_approved?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          pages_assigned?: string | null
          session_id?: string | null
          student_id?: string | null
          teacher_feedback?: string | null
          teacher_score?: number | null
        }
        Update: {
          ai_feedback?: string | null
          ai_score?: number | null
          audio_url?: string | null
          errors_detected?: Json | null
          final_score?: number | null
          id?: string
          is_approved?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          pages_assigned?: string | null
          session_id?: string | null
          student_id?: string | null
          teacher_feedback?: string | null
          teacher_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hifdh_session_participants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      hifdh_session_queue: {
        Row: {
          ended_at: string | null
          id: string
          pages_to_recite: string | null
          queue_position: number
          session_id: string | null
          started_at: string | null
          status: string | null
          student_id: string | null
        }
        Insert: {
          ended_at?: string | null
          id?: string
          pages_to_recite?: string | null
          queue_position: number
          session_id?: string | null
          started_at?: string | null
          status?: string | null
          student_id?: string | null
        }
        Update: {
          ended_at?: string | null
          id?: string
          pages_to_recite?: string | null
          queue_position?: number
          session_id?: string | null
          started_at?: string | null
          status?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hifdh_session_queue_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      hifdh_sessions: {
        Row: {
          accuracy_score: number | null
          audio_path: string | null
          ayah_end: number | null
          ayah_start: number | null
          correct: number | null
          created_at: string | null
          duration: number | null
          feedback: string | null
          fluency_score: number | null
          id: string
          plan_id: string | null
          proctoring_session_id: string | null
          recitation_transcript: string | null
          reviewed_at: string | null
          session_date: string | null
          status: string | null
          streak_count: number | null
          student_id: string | null
          submitted_at: string | null
          surah_name: string | null
          surah_number: number | null
          teacher_feedback: string | null
          teacher_id: string | null
          teacher_score: number | null
          wrong: number | null
        }
        Insert: {
          accuracy_score?: number | null
          audio_path?: string | null
          ayah_end?: number | null
          ayah_start?: number | null
          correct?: number | null
          created_at?: string | null
          duration?: number | null
          feedback?: string | null
          fluency_score?: number | null
          id?: string
          plan_id?: string | null
          proctoring_session_id?: string | null
          recitation_transcript?: string | null
          reviewed_at?: string | null
          session_date?: string | null
          status?: string | null
          streak_count?: number | null
          student_id?: string | null
          submitted_at?: string | null
          surah_name?: string | null
          surah_number?: number | null
          teacher_feedback?: string | null
          teacher_id?: string | null
          teacher_score?: number | null
          wrong?: number | null
        }
        Update: {
          accuracy_score?: number | null
          audio_path?: string | null
          ayah_end?: number | null
          ayah_start?: number | null
          correct?: number | null
          created_at?: string | null
          duration?: number | null
          feedback?: string | null
          fluency_score?: number | null
          id?: string
          plan_id?: string | null
          proctoring_session_id?: string | null
          recitation_transcript?: string | null
          reviewed_at?: string | null
          session_date?: string | null
          status?: string | null
          streak_count?: number | null
          student_id?: string | null
          submitted_at?: string | null
          surah_name?: string | null
          surah_number?: number | null
          teacher_feedback?: string | null
          teacher_id?: string | null
          teacher_score?: number | null
          wrong?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hifdh_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "hifdh_plans"
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
          content: string | null
          course_id: string | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          is_free: boolean | null
          sort_order: number | null
          subject_id: string | null
          title: string
          title_ar: string | null
          video_url: string | null
        }
        Insert: {
          content?: string | null
          course_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_free?: boolean | null
          sort_order?: number | null
          subject_id?: string | null
          title: string
          title_ar?: string | null
          video_url?: string | null
        }
        Update: {
          content?: string | null
          course_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_free?: boolean | null
          sort_order?: number | null
          subject_id?: string | null
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
          {
            foreignKeyName: "lessons_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
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
      live_quiz_answers: {
        Row: {
          answer: string
          answered_at: string | null
          id: string
          is_correct: boolean
          participant_id: string | null
          points_earned: number | null
          question_id: string | null
          room_id: string | null
          time_taken: number | null
        }
        Insert: {
          answer: string
          answered_at?: string | null
          id?: string
          is_correct?: boolean
          participant_id?: string | null
          points_earned?: number | null
          question_id?: string | null
          room_id?: string | null
          time_taken?: number | null
        }
        Update: {
          answer?: string
          answered_at?: string | null
          id?: string
          is_correct?: boolean
          participant_id?: string | null
          points_earned?: number | null
          question_id?: string | null
          room_id?: string | null
          time_taken?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_quiz_answers_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "live_quiz_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_quiz_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "live_quiz_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_quiz_answers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_quiz_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      live_quiz_participants: {
        Row: {
          id: string
          joined_at: string | null
          last_answer_correct: boolean | null
          player_name: string
          room_id: string | null
          score: number
          streak: number
        }
        Insert: {
          id?: string
          joined_at?: string | null
          last_answer_correct?: boolean | null
          player_name: string
          room_id?: string | null
          score?: number
          streak?: number
        }
        Update: {
          id?: string
          joined_at?: string | null
          last_answer_correct?: boolean | null
          player_name?: string
          room_id?: string | null
          score?: number
          streak?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_quiz_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_quiz_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      live_quiz_questions: {
        Row: {
          correct_answer: string
          explanation: string | null
          id: string
          options: Json
          order_index: number
          question: string
          room_id: string | null
          time_limit: number
          topic: string | null
        }
        Insert: {
          correct_answer: string
          explanation?: string | null
          id?: string
          options: Json
          order_index?: number
          question: string
          room_id?: string | null
          time_limit?: number
          topic?: string | null
        }
        Update: {
          correct_answer?: string
          explanation?: string | null
          id?: string
          options?: Json
          order_index?: number
          question?: string
          room_id?: string | null
          time_limit?: number
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_quiz_questions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_quiz_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      live_quiz_rooms: {
        Row: {
          code: string
          created_at: string | null
          current_question_index: number
          host_id: string | null
          id: string
          status: string
          topic: string | null
          total_questions: number
        }
        Insert: {
          code: string
          created_at?: string | null
          current_question_index?: number
          host_id?: string | null
          id?: string
          status?: string
          topic?: string | null
          total_questions?: number
        }
        Update: {
          code?: string
          created_at?: string | null
          current_question_index?: number
          host_id?: string | null
          id?: string
          status?: string
          topic?: string | null
          total_questions?: number
        }
        Relationships: []
      }
      live_sessions: {
        Row: {
          actual_end_time: string | null
          actual_start_time: string | null
          chat_count: number | null
          chat_enabled: boolean | null
          class_settings: Json | null
          created_at: string | null
          duration_minutes: number | null
          ended_at: string | null
          hand_raise_enabled: boolean | null
          homework: string | null
          homework_ar: string | null
          host_id: string
          id: string
          is_recorded: boolean | null
          level: string | null
          materials_url: string | null
          participant_count: number | null
          peak_participants: number | null
          quiz_code: string | null
          recording_auto_saved: boolean | null
          recording_enabled: boolean | null
          recording_status: string | null
          scheduled_at: string | null
          session_number: number | null
          started_at: string | null
          status: string | null
          subject_id: string
          topic: string | null
          topic_ar: string | null
          total_participants: number | null
          waiting_room_enabled: boolean | null
          whiteboard_enabled: boolean | null
        }
        Insert: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          chat_count?: number | null
          chat_enabled?: boolean | null
          class_settings?: Json | null
          created_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          hand_raise_enabled?: boolean | null
          homework?: string | null
          homework_ar?: string | null
          host_id: string
          id?: string
          is_recorded?: boolean | null
          level?: string | null
          materials_url?: string | null
          participant_count?: number | null
          peak_participants?: number | null
          quiz_code?: string | null
          recording_auto_saved?: boolean | null
          recording_enabled?: boolean | null
          recording_status?: string | null
          scheduled_at?: string | null
          session_number?: number | null
          started_at?: string | null
          status?: string | null
          subject_id: string
          topic?: string | null
          topic_ar?: string | null
          total_participants?: number | null
          waiting_room_enabled?: boolean | null
          whiteboard_enabled?: boolean | null
        }
        Update: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          chat_count?: number | null
          chat_enabled?: boolean | null
          class_settings?: Json | null
          created_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          hand_raise_enabled?: boolean | null
          homework?: string | null
          homework_ar?: string | null
          host_id?: string
          id?: string
          is_recorded?: boolean | null
          level?: string | null
          materials_url?: string | null
          participant_count?: number | null
          peak_participants?: number | null
          quiz_code?: string | null
          recording_auto_saved?: boolean | null
          recording_enabled?: boolean | null
          recording_status?: string | null
          scheduled_at?: string | null
          session_number?: number | null
          started_at?: string | null
          status?: string | null
          subject_id?: string
          topic?: string | null
          topic_ar?: string | null
          total_participants?: number | null
          waiting_room_enabled?: boolean | null
          whiteboard_enabled?: boolean | null
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
      liveclass_files: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          subject_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          subject_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          subject_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "liveclass_files_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      majlis_admin_actions: {
        Row: {
          action_type: string
          admin_id: string | null
          created_at: string | null
          duration_hours: number | null
          id: string
          reason: string | null
          target_channel_id: string | null
          target_message_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          admin_id?: string | null
          created_at?: string | null
          duration_hours?: number | null
          id?: string
          reason?: string | null
          target_channel_id?: string | null
          target_message_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          admin_id?: string | null
          created_at?: string | null
          duration_hours?: number | null
          id?: string
          reason?: string | null
          target_channel_id?: string | null
          target_message_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "majlis_admin_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "majlis_admin_actions_target_channel_id_fkey"
            columns: ["target_channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "majlis_admin_actions_target_message_id_fkey"
            columns: ["target_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "majlis_admin_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      majlis_admin_notes: {
        Row: {
          admin_id: string | null
          created_at: string | null
          id: string
          is_private: boolean | null
          note: string
          user_id: string | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string | null
          id?: string
          is_private?: boolean | null
          note: string
          user_id?: string | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string | null
          id?: string
          is_private?: boolean | null
          note?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "majlis_admin_notes_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "majlis_admin_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      majlis_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string | null
          details: Json | null
          id: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "majlis_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      majlis_banned_users: {
        Row: {
          banned_at: string | null
          banned_by: string | null
          channel_id: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          is_permanent: boolean | null
          reason: string | null
          user_id: string
        }
        Insert: {
          banned_at?: string | null
          banned_by?: string | null
          channel_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_permanent?: boolean | null
          reason?: string | null
          user_id: string
        }
        Update: {
          banned_at?: string | null
          banned_by?: string | null
          channel_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_permanent?: boolean | null
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "majlis_banned_users_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "majlis_banned_users_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "majlis_banned_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      majlis_broadcast: {
        Row: {
          id: string
          is_pinned: boolean | null
          message: string
          message_ar: string | null
          pin_expires_at: string | null
          read_count: number | null
          sent_at: string | null
          sent_by: string | null
          target: string | null
          target_user_ids: string[] | null
          title: string | null
        }
        Insert: {
          id?: string
          is_pinned?: boolean | null
          message: string
          message_ar?: string | null
          pin_expires_at?: string | null
          read_count?: number | null
          sent_at?: string | null
          sent_by?: string | null
          target?: string | null
          target_user_ids?: string[] | null
          title?: string | null
        }
        Update: {
          id?: string
          is_pinned?: boolean | null
          message?: string
          message_ar?: string | null
          pin_expires_at?: string | null
          read_count?: number | null
          sent_at?: string | null
          sent_by?: string | null
          target?: string | null
          target_user_ids?: string[] | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "majlis_broadcast_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
      message_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          message_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          message_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          message_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_queue: {
        Row: {
          ai_reason: string | null
          ai_severity: string | null
          ai_verdict: string | null
          author_id: string | null
          content: string
          content_id: string | null
          content_type: string
          created_at: string
          flagged_by: string | null
          id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          ai_reason?: string | null
          ai_severity?: string | null
          ai_verdict?: string | null
          author_id?: string 