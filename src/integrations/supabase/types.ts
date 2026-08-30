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
    PostgrestVersion: "14.17"
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
      admin_preferences: {
        Row: {
          announcement_notifications: boolean
          daily_summary_email: boolean
          email_notifications: boolean
          exam_submission_alert: boolean
          new_registration_alert: boolean
          payment_alert: boolean
          recitation_submission_alert: boolean
          student_complaint_alert: boolean
          updated_at: string
          user_id: string
          whatsapp_notifications: boolean
        }
        Insert: {
          announcement_notifications?: boolean
          daily_summary_email?: boolean
          email_notifications?: boolean
          exam_submission_alert?: boolean
          new_registration_alert?: boolean
          payment_alert?: boolean
          recitation_submission_alert?: boolean
          student_complaint_alert?: boolean
          updated_at?: string
          user_id: string
          whatsapp_notifications?: boolean
        }
        Update: {
          announcement_notifications?: boolean
          daily_summary_email?: boolean
          email_notifications?: boolean
          exam_submission_alert?: boolean
          new_registration_alert?: boolean
          payment_alert?: boolean
          recitation_submission_alert?: boolean
          student_complaint_alert?: boolean
          updated_at?: string
          user_id?: string
          whatsapp_notifications?: boolean
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
      assignment_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string | null
          id: string
          submission_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string | null
          id?: string
          submission_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string | null
          id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_comments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "assignment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          audio_url: string | null
          comment: string | null
          created_at: string | null
          feedback: string | null
          file_url: string | null
          file_urls: string[] | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          id: string
          is_late: boolean | null
          status: string | null
          submitted_at: string | null
          text_response: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assignment_id: string
          audio_url?: string | null
          comment?: string | null
          created_at?: string | null
          feedback?: string | null
          file_url?: string | null
          file_urls?: string[] | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_late?: boolean | null
          status?: string | null
          submitted_at?: string | null
          text_response?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assignment_id?: string
          audio_url?: string | null
          comment?: string | null
          created_at?: string | null
          feedback?: string | null
          file_url?: string | null
          file_urls?: string[] | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_late?: boolean | null
          status?: string | null
          submitted_at?: string | null
          text_response?: string | null
          updated_at?: string | null
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
          {
            foreignKeyName: "attendance_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
          expires_at: string | null
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
          expires_at?: string | null
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
          expires_at?: string | null
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
          banned_at: string | null
          banned_by: string | null
          camera_on: boolean | null
          duration_minutes: number | null
          hand_raised: boolean | null
          hand_raised_at: string | null
          id: string
          is_banned: boolean
          is_muted: boolean | null
          join_request_status: string | null
          join_requested_at: string | null
          joined_at: string | null
          left_at: string | null
          session_id: string | null
          student_id: string
        }
        Insert: {
          banned_at?: string | null
          banned_by?: string | null
          camera_on?: boolean | null
          duration_minutes?: number | null
          hand_raised?: boolean | null
          hand_raised_at?: string | null
          id?: string
          is_banned?: boolean
          is_muted?: boolean | null
          join_request_status?: string | null
          join_requested_at?: string | null
          joined_at?: string | null
          left_at?: string | null
          session_id?: string | null
          student_id: string
        }
        Update: {
          banned_at?: string | null
          banned_by?: string | null
          camera_on?: boolean | null
          duration_minutes?: number | null
          hand_raised?: boolean | null
          hand_raised_at?: string | null
          id?: string
          is_banned?: boolean
          is_muted?: boolean | null
          join_request_status?: string | null
          join_requested_at?: string | null
          joined_at?: string | null
          left_at?: string | null
          session_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_participants_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "class_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_participants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
          admin_note: string | null
          created_at: string
          current_question_index: number
          exam_id: string
          extra_time_minutes: number
          feedback: string | null
          id: string
          integrity_score: number | null
          last_activity_at: string
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
          time_extended_at: string | null
          time_extended_by: string | null
          total_points: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          current_question_index?: number
          exam_id: string
          extra_time_minutes?: number
          feedback?: string | null
          id?: string
          integrity_score?: number | null
          last_activity_at?: string
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
          time_extended_at?: string | null
          time_extended_by?: string | null
          total_points?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          current_question_index?: number
          exam_id?: string
          extra_time_minutes?: number
          feedback?: string | null
          id?: string
          integrity_score?: number | null
          last_activity_at?: string
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
          time_extended_at?: string | null
          time_extended_by?: string | null
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
          registration_deadline: string | null
          registration_open: boolean
          rtl_mode: boolean | null
          screenshot_interval_seconds: number | null
          show_marks_per_question: boolean | null
          show_question_numbers: boolean | null
          show_results_immediately: boolean | null
          start_date: string | null
          subject_id: string | null
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
          registration_deadline?: string | null
          registration_open?: boolean
          rtl_mode?: boolean | null
          screenshot_interval_seconds?: number | null
          show_marks_per_question?: boolean | null
          show_question_numbers?: boolean | null
          show_results_immediately?: boolean | null
          start_date?: string | null
          subject_id?: string | null
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
          registration_deadline?: string | null
          registration_open?: boolean
          rtl_mode?: boolean | null
          screenshot_interval_seconds?: number | null
          show_marks_per_question?: boolean | null
          show_question_numbers?: boolean | null
          show_results_immediately?: boolean | null
          start_date?: string | null
          subject_id?: string | null
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
          {
            foreignKeyName: "exams_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      general_musabaqah_access_codes: {
        Row: {
          allow_reconnect: boolean
          code: string
          created_at: string
          event_id: string
          expires_at: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          registration_id: string
          revoked_at: string | null
          revoked_reason: string | null
          usage_count: number
        }
        Insert: {
          allow_reconnect?: boolean
          code: string
          created_at?: string
          event_id: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          registration_id: string
          revoked_at?: string | null
          revoked_reason?: string | null
          usage_count?: number
        }
        Update: {
          allow_reconnect?: boolean
          code?: string
          created_at?: string
          event_id?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          registration_id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "general_musabaqah_access_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_musabaqah_access_codes_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "general_musabaqah_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      general_musabaqah_answers: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          asked_at: string
          event_id: string
          id: string
          participant_id: string
          question_id: string
          status: string
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          asked_at?: string
          event_id: string
          id?: string
          participant_id: string
          question_id: string
          status?: string
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          asked_at?: string
          event_id?: string
          id?: string
          participant_id?: string
          question_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_musabaqah_answers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_musabaqah_answers_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_musabaqah_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      general_musabaqah_event_log: {
        Row: {
          action_type: string
          created_at: string
          created_by: string | null
          description: string | null
          event_id: string
          id: number
          metadata: Json
          participant_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id: string
          id?: number
          metadata?: Json
          participant_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string
          id?: number
          metadata?: Json
          participant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "general_musabaqah_event_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_musabaqah_event_log_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      general_musabaqah_events: {
        Row: {
          ai_auto_approve_questions: boolean
          allow_question_repeat: boolean
          category_targets: Json
          competition_date: string | null
          connection_loss_pauses_timer: boolean
          created_at: string
          created_by: string | null
          current_participant_id: string | null
          description: string | null
          expected_end_time: string | null
          id: string
          instructions: string | null
          judge_scoring_system: string
          judges_can_modify_marks: boolean
          leaderboard_enabled: boolean
          marks_per_question: number
          max_attempts: number
          max_exam_time_seconds: number
          num_judges: number
          num_questions_per_student: number
          passing_score: number | null
          question_selection_method: string
          reveal_index: number | null
          question_time_seconds: number | null
          randomize_questions: boolean
          recording_enabled: boolean
          registration_closes_at: string | null
          registration_opens_at: string | null
          repeat_after_n_students: number | null
          results_visibility: string
          room_code: string
          source_reference: string | null
          start_time: string | null
          status: string
          subject: string
          target_level: string | null
          timezone: string
          title: string
          topic: string | null
          total_marks: number | null
          updated_at: string
        }
        Insert: {
          ai_auto_approve_questions?: boolean
          allow_question_repeat?: boolean
          category_targets?: Json
          competition_date?: string | null
          connection_loss_pauses_timer?: boolean
          created_at?: string
          created_by?: string | null
          current_participant_id?: string | null
          description?: string | null
          expected_end_time?: string | null
          id?: string
          instructions?: string | null
          judge_scoring_system?: string
          judges_can_modify_marks?: boolean
          leaderboard_enabled?: boolean
          marks_per_question?: number
          max_attempts?: number
          max_exam_time_seconds?: number
          num_judges?: number
          num_questions_per_student?: number
          passing_score?: number | null
          question_selection_method?: string
          reveal_index?: number | null
          question_time_seconds?: number | null
          randomize_questions?: boolean
          recording_enabled?: boolean
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          repeat_after_n_students?: number | null
          results_visibility?: string
          room_code?: string
          source_reference?: string | null
          start_time?: string | null
          status?: string
          subject: string
          target_level?: string | null
          timezone?: string
          title: string
          topic?: string | null
          total_marks?: number | null
          updated_at?: string
        }
        Update: {
          ai_auto_approve_questions?: boolean
          allow_question_repeat?: boolean
          category_targets?: Json
          competition_date?: string | null
          connection_loss_pauses_timer?: boolean
          created_at?: string
          created_by?: string | null
          current_participant_id?: string | null
          description?: string | null
          expected_end_time?: string | null
          id?: string
          instructions?: string | null
          judge_scoring_system?: string
          judges_can_modify_marks?: boolean
          leaderboard_enabled?: boolean
          marks_per_question?: number
          max_attempts?: number
          max_exam_time_seconds?: number
          num_judges?: number
          num_questions_per_student?: number
          passing_score?: number | null
          question_selection_method?: string
          reveal_index?: number | null
          question_time_seconds?: number | null
          randomize_questions?: boolean
          recording_enabled?: boolean
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          repeat_after_n_students?: number | null
          results_visibility?: string
          room_code?: string
          source_reference?: string | null
          start_time?: string | null
          status?: string
          subject?: string
          target_level?: string | null
          timezone?: string
          title?: string
          topic?: string | null
          total_marks?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_musabaqah_events_current_participant_fkey"
            columns: ["current_participant_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      general_musabaqah_judges: {
        Row: {
          can_finalize: boolean
          categories_assigned: Json
          created_at: string
          event_id: string
          id: string
          judge_name: string
          judge_role: string
          user_id: string
          weight: number
        }
        Insert: {
          can_finalize?: boolean
          categories_assigned?: Json
          created_at?: string
          event_id: string
          id?: string
          judge_name: string
          judge_role?: string
          user_id: string
          weight?: number
        }
        Update: {
          can_finalize?: boolean
          categories_assigned?: Json
          created_at?: string
          event_id?: string
          id?: string
          judge_name?: string
          judge_role?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "general_musabaqah_judges_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_events"
            referencedColumns: ["id"]
          },
        ]
      }
      general_musabaqah_participants: {
        Row: {
          access_code_id: string | null
          camera_on: boolean
          connection_status: string
          created_at: string
          current_question_id: string | null
          disconnected_at: string | null
          event_id: string
          id: string
          mic_on: boolean
          participant_name: string
          pause_reason: string | null
          paused_at: string | null
          question_timer_started_at: string | null
          questions_asked: Json
          queue_position: number | null
          recording_url: string | null
          registration_id: string
          session_state: Json
          status: string
          timer_paused_at: string | null
          timer_remaining_seconds: number | null
          total_score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          access_code_id?: string | null
          camera_on?: boolean
          connection_status?: string
          created_at?: string
          current_question_id?: string | null
          disconnected_at?: string | null
          event_id: string
          id?: string
          mic_on?: boolean
          participant_name: string
          pause_reason?: string | null
          paused_at?: string | null
          question_timer_started_at?: string | null
          questions_asked?: Json
          queue_position?: number | null
          recording_url?: string | null
          registration_id: string
          session_state?: Json
          status?: string
          timer_paused_at?: string | null
          timer_remaining_seconds?: number | null
          total_score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          access_code_id?: string | null
          camera_on?: boolean
          connection_status?: string
          created_at?: string
          current_question_id?: string | null
          disconnected_at?: string | null
          event_id?: string
          id?: string
          mic_on?: boolean
          participant_name?: string
          pause_reason?: string | null
          paused_at?: string | null
          question_timer_started_at?: string | null
          questions_asked?: Json
          queue_position?: number | null
          recording_url?: string | null
          registration_id?: string
          session_state?: Json
          status?: string
          timer_paused_at?: string | null
          timer_remaining_seconds?: number | null
          total_score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_musabaqah_participants_access_code_id_fkey"
            columns: ["access_code_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_access_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_musabaqah_participants_current_question_fkey"
            columns: ["current_question_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_musabaqah_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_musabaqah_participants_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      general_musabaqah_question_usage: {
        Row: {
          id: string
          participant_id: string
          question_id: string
          used_at: string
        }
        Insert: {
          id?: string
          participant_id: string
          question_id: string
          used_at?: string
        }
        Update: {
          id?: string
          participant_id?: string
          question_id?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_musabaqah_question_usage_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_musabaqah_question_usage_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      general_musabaqah_questions: {
        Row: {
          ai_confidence: number | null
          ai_generated: boolean
          category: string
          created_at: string
          created_by: string | null
          difficulty: string
          event_id: string
          expected_answer: string | null
          id: string
          last_used_at: string | null
          marks: number
          options: Json | null
          question_text: string
          question_text_ar: string | null
          question_type: string
          rubric: Json | null
          source_reference: string | null
          stage_id: string | null
          status: string
          times_used: number
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_generated?: boolean
          category: string
          created_at?: string
          created_by?: string | null
          difficulty?: string
          event_id: string
          expected_answer?: string | null
          id?: string
          last_used_at?: string | null
          marks?: number
          options?: Json | null
          question_text: string
          question_text_ar?: string | null
          question_type?: string
          rubric?: Json | null
          source_reference?: string | null
          stage_id?: string | null
          status?: string
          times_used?: number
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_generated?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          difficulty?: string
          event_id?: string
          expected_answer?: string | null
          id?: string
          last_used_at?: string | null
          marks?: number
          options?: Json | null
          question_text?: string
          question_text_ar?: string | null
          question_type?: string
          rubric?: Json | null
          source_reference?: string | null
          stage_id?: string | null
          status?: string
          times_used?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_musabaqah_questions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_musabaqah_questions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      general_musabaqah_stages: {
        Row: {
          categories: Json
          created_at: string
          difficulty: string
          event_id: string
          id: string
          name: string
          question_count: number
          stage_order: number
          updated_at: string
        }
        Insert: {
          categories?: Json
          created_at?: string
          difficulty?: string
          event_id: string
          id?: string
          name: string
          question_count?: number
          stage_order?: number
          updated_at?: string
        }
        Update: {
          categories?: Json
          created_at?: string
          difficulty?: string
          event_id?: string
          id?: string
          name?: string
          question_count?: number
          stage_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_musabaqah_stages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_events"
            referencedColumns: ["id"]
          },
        ]
      }
      general_musabaqah_registrations: {
        Row: {
          additional_info: Json
          created_at: string
          event_id: string
          full_name: string
          id: string
          level_class: string | null
          phone: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_info?: Json
          created_at?: string
          event_id: string
          full_name: string
          id?: string
          level_class?: string | null
          phone?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_info?: Json
          created_at?: string
          event_id?: string
          full_name?: string
          id?: string
          level_class?: string | null
          phone?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_musabaqah_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_events"
            referencedColumns: ["id"]
          },
        ]
      }
      general_musabaqah_scores: {
        Row: {
          ai_suggested_score: number | null
          ai_suggestion_note: string | null
          answer_id: string
          comment: string | null
          correctness: string | null
          created_at: string
          id: string
          judge_name: string
          judge_user_id: string
          max_score: number
          participant_id: string
          rubric_breakdown: Json | null
          score: number
          updated_at: string
        }
        Insert: {
          ai_suggested_score?: number | null
          ai_suggestion_note?: string | null
          answer_id: string
          comment?: string | null
          correctness?: string | null
          created_at?: string
          id?: string
          judge_name: string
          judge_user_id: string
          max_score: number
          participant_id: string
          rubric_breakdown?: Json | null
          score: number
          updated_at?: string
        }
        Update: {
          ai_suggested_score?: number | null
          ai_suggestion_note?: string | null
          answer_id?: string
          comment?: string | null
          correctness?: string | null
          created_at?: string
          id?: string
          judge_name?: string
          judge_user_id?: string
          max_score?: number
          participant_id?: string
          rubric_breakdown?: Json | null
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_musabaqah_scores_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_musabaqah_scores_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "general_musabaqah_participants"
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
      hifdh_memorization_sessions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          duration_seconds: number | null
          id: string
          reps_per_verse: number | null
          score: number | null
          student_id: string | null
          surah_name: string | null
          surah_number: number | null
          total_reps: number | null
          verses_count: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          reps_per_verse?: number | null
          score?: number | null
          student_id?: string | null
          surah_name?: string | null
          surah_number?: number | null
          total_reps?: number | null
          verses_count?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          reps_per_verse?: number | null
          score?: number | null
          student_id?: string | null
          surah_name?: string | null
          surah_number?: number | null
          total_reps?: number | null
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
      hifdh_test_sessions: {
        Row: {
          completed_at: string | null
          correct_answers: number | null
          created_at: string | null
          duration_seconds: number | null
          id: string
          proctoring_session_id: string | null
          score: number | null
          student_id: string | null
          surah_name: string | null
          surah_number: number | null
          total_questions: number | null
        }
        Insert: {
          completed_at?: string | null
          correct_answers?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          proctoring_session_id?: string | null
          score?: number | null
          student_id?: string | null
          surah_name?: string | null
          surah_number?: number | null
          total_questions?: number | null
        }
        Update: {
          completed_at?: string | null
          correct_answers?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          proctoring_session_id?: string | null
          score?: number | null
          student_id?: string | null
          surah_name?: string | null
          surah_number?: number | null
          total_questions?: number | null
        }
        Relationships: []
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
          is_compulsory: boolean
          level: string
          subject_id: string | null
        }
        Insert: {
          id?: string
          is_compulsory?: boolean
          level: string
          subject_id?: string | null
        }
        Update: {
          id?: string
          is_compulsory?: boolean
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
          is_recording: boolean
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
          is_recording?: boolean
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
          is_recording?: boolean
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
            foreignKeyName: "manual_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
          author_id?: string | null
          content: string
          content_id?: string | null
          content_type?: string
          created_at?: string
          flagged_by?: string | null
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          ai_reason?: string | null
          ai_severity?: string | null
          ai_verdict?: string | null
          author_id?: string | null
          content?: string
          content_id?: string | null
          content_type?: string
          created_at?: string
          flagged_by?: string | null
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      musabaqah_attempts: {
        Row: {
          ayah_number: number | null
          bell_count: number
          competition_id: string
          created_at: string
          duration_seconds: number | null
          id: string
          judge_comment: string | null
          judge_score: number | null
          participant_id: string
          scope_label: string
          scope_label_ar: string
          score_breakdown: Json | null
          stage_number: number
          status: string
          surah_number: number | null
        }
        Insert: {
          ayah_number?: number | null
          bell_count?: number
          competition_id: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          judge_comment?: string | null
          judge_score?: number | null
          participant_id: string
          scope_label?: string
          scope_label_ar?: string
          score_breakdown?: Json | null
          stage_number?: number
          status?: string
          surah_number?: number | null
        }
        Update: {
          ayah_number?: number | null
          bell_count?: number
          competition_id?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          judge_comment?: string | null
          judge_score?: number | null
          participant_id?: string
          scope_label?: string
          scope_label_ar?: string
          score_breakdown?: Json | null
          stage_number?: number
          status?: string
          surah_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "musabaqah_attempts_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "musabaqah_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "musabaqah_attempts_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "musabaqah_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      musabaqah_competitions: {
        Row: {
          created_at: string
          created_by: string | null
          current_participant_id: string | null
          current_stage: number
          description: string | null
          id: string
          juz_options: number[] | null
          queue_box_count: number
          queue_reveal_active: boolean
          queue_shuffle_boxes: Json | null
          registration_deadline: string | null
          registration_override: string
          results_reveal_active: boolean
          revealed_participant_ids: Json
          room_code: string
          scope_config: Json | null
          scope_type: string
          session_start_at: string | null
          status: string
          time_limit_seconds: number
          title: string
          total_stages: number
          updated_at: string
          use_criteria_scoring: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_participant_id?: string | null
          current_stage?: number
          description?: string | null
          id?: string
          juz_options?: number[] | null
          queue_box_count?: number
          queue_reveal_active?: boolean
          queue_shuffle_boxes?: Json | null
          registration_deadline?: string | null
          registration_override?: string
          results_reveal_active?: boolean
          revealed_participant_ids?: Json
          room_code: string
          scope_config?: Json | null
          scope_type?: string
          session_start_at?: string | null
          status?: string
          time_limit_seconds?: number
          title: string
          total_stages?: number
          updated_at?: string
          use_criteria_scoring?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_participant_id?: string | null
          current_stage?: number
          description?: string | null
          id?: string
          juz_options?: number[] | null
          queue_box_count?: number
          queue_reveal_active?: boolean
          queue_shuffle_boxes?: Json | null
          registration_deadline?: string | null
          registration_override?: string
          results_reveal_active?: boolean
          revealed_participant_ids?: Json
          room_code?: string
          scope_config?: Json | null
          scope_type?: string
          session_start_at?: string | null
          status?: string
          time_limit_seconds?: number
          title?: string
          total_stages?: number
          updated_at?: string
          use_criteria_scoring?: boolean
        }
        Relationships: []
      }
      musabaqah_events: {
        Row: {
          created_at: string
          event_type: string
          id: number
          payload: Json | null
          room_id: string
          sent_by: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: number
          payload?: Json | null
          room_id: string
          sent_by?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: number
          payload?: Json | null
          room_id?: string
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "musabaqah_events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "musabaqah_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      musabaqah_judge_scores: {
        Row: {
          attempt_id: string
          comment: string | null
          competition_id: string
          created_at: string
          id: string
          judge_name: string
          judge_user_id: string
          participant_id: string
          score_breakdown: Json | null
          total_score: number
          updated_at: string
        }
        Insert: {
          attempt_id: string
          comment?: string | null
          competition_id: string
          created_at?: string
          id?: string
          judge_name: string
          judge_user_id: string
          participant_id: string
          score_breakdown?: Json | null
          total_score?: number
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          comment?: string | null
          competition_id?: string
          created_at?: string
          id?: string
          judge_name?: string
          judge_user_id?: string
          participant_id?: string
          score_breakdown?: Json | null
          total_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "musabaqah_judge_scores_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "musabaqah_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "musabaqah_judge_scores_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "musabaqah_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "musabaqah_judge_scores_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "musabaqah_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      musabaqah_participants: {
        Row: {
          access_code: string | null
          assigned_juz: number | null
          bell_counts: Json
          camera_on: boolean
          code_acknowledged: boolean
          competition_id: string
          created_at: string
          id: string
          participant_name: string
          proctor_flagged: boolean
          queue_box_id: number | null
          queue_position: number
          role: string | null
          school: string | null
          stage_scores: Json
          status: string
          total_score: number
          user_id: string | null
        }
        Insert: {
          access_code?: string | null
          assigned_juz?: number | null
          bell_counts?: Json
          camera_on?: boolean
          code_acknowledged?: boolean
          competition_id: string
          created_at?: string
          id?: string
          participant_name: string
          proctor_flagged?: boolean
          queue_box_id?: number | null
          queue_position?: number
          role?: string | null
          school?: string | null
          stage_scores?: Json
          status?: string
          total_score?: number
          user_id?: string | null
        }
        Update: {
          access_code?: string | null
          assigned_juz?: number | null
          bell_counts?: Json
          camera_on?: boolean
          code_acknowledged?: boolean
          competition_id?: string
          created_at?: string
          id?: string
          participant_name?: string
          proctor_flagged?: boolean
          queue_box_id?: number | null
          queue_position?: number
          role?: string | null
          school?: string | null
          stage_scores?: Json
          status?: string
          total_score?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "musabaqah_participants_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "musabaqah_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      musabaqah_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: number
          room_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: number
          room_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: number
          room_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "musabaqah_reactions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "musabaqah_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      musabaqah_rooms: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          current_contestant_idx: number | null
          current_phase: string | null
          current_stage_idx: number | null
          description: string | null
          id: string
          scope: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          current_contestant_idx?: number | null
          current_phase?: string | null
          current_stage_idx?: number | null
          description?: string | null
          id?: string
          scope?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          current_contestant_idx?: number | null
          current_phase?: string | null
          current_stage_idx?: number | null
          description?: string | null
          id?: string
          scope?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      musabaqah_scores: {
        Row: {
          bell_count: number | null
          contestant_name: string
          contestant_user_id: string | null
          created_at: string
          id: string
          judged_by: string | null
          notes: string | null
          question_ayah: string | null
          question_id: number | null
          question_surah: string | null
          room_id: string
          score_adab: number | null
          score_hifdh: number | null
          score_tajweed: number | null
          score_tarteel: number | null
          score_total: number
          stage_idx: number
          stage_name: string | null
        }
        Insert: {
          bell_count?: number | null
          contestant_name: string
          contestant_user_id?: string | null
          created_at?: string
          id?: string
          judged_by?: string | null
          notes?: string | null
          question_ayah?: string | null
          question_id?: number | null
          question_surah?: string | null
          room_id: string
          score_adab?: number | null
          score_hifdh?: number | null
          score_tajweed?: number | null
          score_tarteel?: number | null
          score_total?: number
          stage_idx: number
          stage_name?: string | null
        }
        Update: {
          bell_count?: number | null
          contestant_name?: string
          contestant_user_id?: string | null
          created_at?: string
          id?: string
          judged_by?: string | null
          notes?: string | null
          question_ayah?: string | null
          question_id?: number | null
          question_surah?: string | null
          room_id?: string
          score_adab?: number | null
          score_hifdh?: number | null
          score_tajweed?: number | null
          score_tarteel?: number | null
          score_total?: number
          stage_idx?: number
          stage_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "musabaqah_scores_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "musabaqah_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: number
          notification_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          id?: never
          notification_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: never
          notification_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          email_enabled: boolean
          muted_types: string[]
          push_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          telegram_enabled: boolean
          updated_at: string
          user_id: string
          whatsapp_enabled: boolean
        }
        Insert: {
          email_enabled?: boolean
          muted_types?: string[]
          push_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          telegram_enabled?: boolean
          updated_at?: string
          user_id: string
          whatsapp_enabled?: boolean
        }
        Update: {
          email_enabled?: boolean
          muted_types?: string[]
          push_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          telegram_enabled?: boolean
          updated_at?: string
          user_id?: string
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      notification_send_log: {
        Row: {
          ai_generated: boolean | null
          created_at: string
          event_type: string | null
          id: string
          message_ar: string | null
          message_en: string | null
          recipient_count: number | null
          sent_by: string | null
          target: string | null
          title_ar: string | null
          title_en: string | null
          type: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          created_at?: string
          event_type?: string | null
          id?: string
          message_ar?: string | null
          message_en?: string | null
          recipient_count?: number | null
          sent_by?: string | null
          target?: string | null
          title_ar?: string | null
          title_en?: string | null
          type?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          created_at?: string
          event_type?: string | null
          id?: string
          message_ar?: string | null
          message_en?: string | null
          recipient_count?: number | null
          sent_by?: string | null
          target?: string | null
          title_ar?: string | null
          title_en?: string | null
          type?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          dedup_key: string | null
          id: string
          is_read: boolean
          link: string | null
          message: string
          message_ar: string | null
          priority: string
          read_at: string | null
          title: string
          title_ar: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedup_key?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          message_ar?: string | null
          priority?: string
          read_at?: string | null
          title: string
          title_ar?: string | null
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedup_key?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          message_ar?: string | null
          priority?: string
          read_at?: string | null
          title?: string
          title_ar?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_forms: {
        Row: {
          arabic_level: string | null
          city: string | null
          completed_at: string | null
          country: string | null
          created_at: string | null
          dob: string | null
          extra_notes: string | null
          gender: string | null
          heard_from: string | null
          hours_per_day: string | null
          id: string
          islamic_knowledge: string | null
          learning_goals: string[] | null
          memorized_surahs: string[] | null
          occupation: string | null
          phone: string | null
          preferred_device: string | null
          preferred_subjects: string[] | null
          preferred_time: string | null
          previous_teacher: string | null
          quran_level: string | null
          review_comment: string | null
          review_rating: number | null
          tajweed_knowledge: string | null
          user_id: string | null
          years_studying: string | null
        }
        Insert: {
          arabic_level?: string | null
          city?: string | null
          completed_at?: string | null
          country?: string | null
          created_at?: string | null
          dob?: string | null
          extra_notes?: string | null
          gender?: string | null
          heard_from?: string | null
          hours_per_day?: string | null
          id?: string
          islamic_knowledge?: string | null
          learning_goals?: string[] | null
          memorized_surahs?: string[] | null
          occupation?: string | null
          phone?: string | null
          preferred_device?: string | null
          preferred_subjects?: string[] | null
          preferred_time?: string | null
          previous_teacher?: string | null
          quran_level?: string | null
          review_comment?: string | null
          review_rating?: number | null
          tajweed_knowledge?: string | null
          user_id?: string | null
          years_studying?: string | null
        }
        Update: {
          arabic_level?: string | null
          city?: string | null
          completed_at?: string | null
          country?: string | null
          created_at?: string | null
          dob?: string | null
          extra_notes?: string | null
          gender?: string | null
          heard_from?: string | null
          hours_per_day?: string | null
          id?: string
          islamic_knowledge?: string | null
          learning_goals?: string[] | null
          memorized_surahs?: string[] | null
          occupation?: string | null
          phone?: string | null
          preferred_device?: string | null
          preferred_subjects?: string[] | null
          preferred_time?: string | null
          previous_teacher?: string | null
          quran_level?: string | null
          review_comment?: string | null
          review_rating?: number | null
          tajweed_knowledge?: string | null
          user_id?: string | null
          years_studying?: string | null
        }
        Relationships: []
      }
      page_views: {
        Row: {
          created_at: string
          device_type: string | null
          id: string
          path: string
          referrer: string | null
          session_id: string
          user_agent: string | null
          user_id: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          id?: string
          path: string
          referrer?: string | null
          session_id: string
          user_agent?: string | null
          user_id?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string
          device_type?: string | null
          id?: string
          path?: string
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      payment_history: {
        Row: {
          amount: number
          created_at: string | null
          enrollment_id: string | null
          id: string
          level: string | null
          paid_at: string | null
          payment_ref: string | null
          payment_type: string | null
          plan_type: string | null
          receipt_id: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          enrollment_id?: string | null
          id?: string
          level?: string | null
          paid_at?: string | null
          payment_ref?: string | null
          payment_type?: string | null
          plan_type?: string | null
          receipt_id?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          enrollment_id?: string | null
          id?: string
          level?: string | null
          paid_at?: string | null
          payment_ref?: string | null
          payment_type?: string | null
          plan_type?: string | null
          receipt_id?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_history_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          description: string | null
          description_ar: string | null
          duration_months: number | null
          id: string
          is_active: boolean | null
          level: string | null
          name: string
          name_ar: string | null
          paystack_plan_code: string | null
          type: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          description_ar?: string | null
          duration_months?: number | null
          id?: string
          is_active?: boolean | null
          level?: string | null
          name: string
          name_ar?: string | null
          paystack_plan_code?: string | null
          type?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          description_ar?: string | null
          duration_months?: number | null
          id?: string
          is_active?: boolean | null
          level?: string | null
          name?: string
          name_ar?: string | null
          paystack_plan_code?: string | null
          type?: string | null
        }
        Relationships: []
      }
      payment_switch_log: {
        Row: {
          action: string | null
          affected_students: number | null
          auto_on_date: string | null
          created_at: string | null
          done_by: string | null
          id: string
          reason: string | null
          reason_ar: string | null
        }
        Insert: {
          action?: string | null
          affected_students?: number | null
          auto_on_date?: string | null
          created_at?: string | null
          done_by?: string | null
          id?: string
          reason?: string | null
          reason_ar?: string | null
        }
        Update: {
          action?: string | null
          affected_students?: number | null
          auto_on_date?: string | null
          created_at?: string | null
          done_by?: string | null
          id?: string
          reason?: string | null
          reason_ar?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          paystack_reference: string | null
          paystack_transaction_id: string | null
          plan_id: string | null
          receipt_sent: boolean | null
          recorded_by: string | null
          status: string | null
          student_id: string
          term: string | null
          type: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          paystack_reference?: string | null
          paystack_transaction_id?: string | null
          plan_id?: string | null
          receipt_sent?: boolean | null
          recorded_by?: string | null
          status?: string | null
          student_id: string
          term?: string | null
          type?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          paystack_reference?: string | null
          paystack_transaction_id?: string | null
          plan_id?: string | null
          receipt_sent?: boolean | null
          recorded_by?: string | null
          status?: string | null
          student_id?: string
          term?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
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
      private_student_courses: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          course_id: string
          id: string
          student_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          course_id: string
          id?: string
          student_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          course_id?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_student_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      private_student_subjects: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          student_id: string
          subject_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          student_id: string
          subject_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          student_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_student_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      private_student_timetable: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          slot_id: string
          student_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          slot_id: string
          student_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          slot_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_student_timetable_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "subject_timetable"
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
        Relationships: []
      }
      proctoring_sessions: {
        Row: {
          attempt_id: string
          context_label: string | null
          ended_at: string | null
          fullscreen_active: boolean | null
          id: string
          integrity_score: number | null
          max_warnings: number | null
          microphone_enabled: boolean | null
          session_type: string
          started_at: string
          student_id: string | null
          suspicion_level: string | null
          total_violations: number | null
          updated_at: string
          warnings_issued: number | null
          webcam_enabled: boolean | null
        }
        Insert: {
          attempt_id: string
          context_label?: string | null
          ended_at?: string | null
          fullscreen_active?: boolean | null
          id?: string
          integrity_score?: number | null
          max_warnings?: number | null
          microphone_enabled?: boolean | null
          session_type?: string
          started_at?: string
          student_id?: string | null
          suspicion_level?: string | null
          total_violations?: number | null
          updated_at?: string
          warnings_issued?: number | null
          webcam_enabled?: boolean | null
        }
        Update: {
          attempt_id?: string
          context_label?: string | null
          ended_at?: string | null
          fullscreen_active?: boolean | null
          id?: string
          integrity_score?: number | null
          max_warnings?: number | null
          microphone_enabled?: boolean | null
          session_type?: string
          started_at?: string
          student_id?: string | null
          suspicion_level?: string | null
          total_violations?: number | null
          updated_at?: string
          warnings_issued?: number | null
          webcam_enabled?: boolean | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age_group: string | null
          allow_entrance_retake: boolean | null
          allow_general_access: boolean | null
          assigned_teacher_id: string | null
          auth_provider: string | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          country: string | null
          course_level: string | null
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
          is_founding_member: boolean | null
          is_payment_exempt: boolean | null
          learning_goal: string | null
          level: string | null
          nationality: string | null
          onboarding_completed: boolean | null
          parent_name: string | null
          parent_phone: string | null
          parent_relationship: string | null
          parent_whatsapp: string | null
          payment_grace_end: string | null
          payment_status: string | null
          phone: string | null
          preferred_language: string | null
          private_notes: string | null
          private_session_rate: string | null
          role: string | null
          status: string | null
          student_id: string | null
          student_type: string | null
          subscription_end_date: string | null
          telegram_chat_id: string | null
          telegram_link_code: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          age_group?: string | null
          allow_entrance_retake?: boolean | null
          allow_general_access?: boolean | null
          assigned_teacher_id?: string | null
          auth_provider?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          course_level?: string | null
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
          is_founding_member?: boolean | null
          is_payment_exempt?: boolean | null
          learning_goal?: string | null
          level?: string | null
          nationality?: string | null
          onboarding_completed?: boolean | null
          parent_name?: string | null
          parent_phone?: string | null
          parent_relationship?: string | null
          parent_whatsapp?: string | null
          payment_grace_end?: string | null
          payment_status?: string | null
          phone?: string | null
          preferred_language?: string | null
          private_notes?: string | null
          private_session_rate?: string | null
          role?: string | null
          status?: string | null
          student_id?: string | null
          student_type?: string | null
          subscription_end_date?: string | null
          telegram_chat_id?: string | null
          telegram_link_code?: string | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          age_group?: string | null
          allow_entrance_retake?: boolean | null
          allow_general_access?: boolean | null
          assigned_teacher_id?: string | null
          auth_provider?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          course_level?: string | null
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
          is_founding_member?: boolean | null
          is_payment_exempt?: boolean | null
          learning_goal?: string | null
          level?: string | null
          nationality?: string | null
          onboarding_completed?: boolean | null
          parent_name?: string | null
          parent_phone?: string | null
          parent_relationship?: string | null
          parent_whatsapp?: string | null
          payment_grace_end?: string | null
          payment_status?: string | null
          phone?: string | null
          preferred_language?: string | null
          private_notes?: string | null
          private_session_rate?: string | null
          role?: string | null
          status?: string | null
          student_id?: string | null
          student_type?: string | null
          subscription_end_date?: string | null
          telegram_chat_id?: string | null
          telegram_link_code?: string | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      public_class_guests: {
        Row: {
          class_id: string | null
          device_info: string | null
          duration_minutes: number | null
          guest_email: string | null
          guest_name: string
          id: string
          is_registered_user: boolean | null
          joined_at: string | null
          left_at: string | null
          user_id: string | null
        }
        Insert: {
          class_id?: string | null
          device_info?: string | null
          duration_minutes?: number | null
          guest_email?: string | null
          guest_name: string
          id?: string
          is_registered_user?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          user_id?: string | null
        }
        Update: {
          class_id?: string | null
          device_info?: string | null
          duration_minutes?: number | null
          guest_email?: string | null
          guest_name?: string
          id?: string
          is_registered_user?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_class_guests_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "public_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      public_class_registrations: {
        Row: {
          class_id: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          registered_at: string | null
        }
        Insert: {
          class_id?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          registered_at?: string | null
        }
        Update: {
          class_id?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          registered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_class_registrations_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "public_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      public_classes: {
        Row: {
          actual_end_time: string | null
          actual_start_time: string | null
          allow_guest_camera: boolean | null
          allow_guest_mic: boolean | null
          allow_guests: boolean | null
          chat_enabled: boolean | null
          created_at: string | null
          description: string | null
          description_ar: string | null
          guest_count: number | null
          host_id: string
          id: string
          is_featured: boolean | null
          join_url: string | null
          livekit_room_name: string | null
          max_guests: number | null
          password: string | null
          password_enabled: boolean | null
          raise_hand_enabled: boolean | null
          recording_enabled: boolean | null
          require_name: boolean | null
          room_code: string
          scheduled_at: string | null
          status: string | null
          subject_id: string | null
          title: string
          title_ar: string | null
        }
        Insert: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          allow_guest_camera?: boolean | null
          allow_guest_mic?: boolean | null
          allow_guests?: boolean | null
          chat_enabled?: boolean | null
          created_at?: string | null
          description?: string | null
          description_ar?: string | null
          guest_count?: number | null
          host_id: string
          id?: string
          is_featured?: boolean | null
          join_url?: string | null
          livekit_room_name?: string | null
          max_guests?: number | null
          password?: string | null
          password_enabled?: boolean | null
          raise_hand_enabled?: boolean | null
          recording_enabled?: boolean | null
          require_name?: boolean | null
          room_code: string
          scheduled_at?: string | null
          status?: string | null
          subject_id?: string | null
          title: string
          title_ar?: string | null
        }
        Update: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          allow_guest_camera?: boolean | null
          allow_guest_mic?: boolean | null
          allow_guests?: boolean | null
          chat_enabled?: boolean | null
          created_at?: string | null
          description?: string | null
          description_ar?: string | null
          guest_count?: number | null
          host_id?: string
          id?: string
          is_featured?: boolean | null
          join_url?: string | null
          livekit_room_name?: string | null
          max_guests?: number | null
          password?: string | null
          password_enabled?: boolean | null
          raise_hand_enabled?: boolean | null
          recording_enabled?: boolean | null
          require_name?: boolean | null
          room_code?: string
          scheduled_at?: string | null
          status?: string | null
          subject_id?: string | null
          title?: string
          title_ar?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_classes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string
          endpoint: string
          id: string
          keys: Json | null
          p256dh: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auth?: string | null
          created_at?: string
          endpoint: string
          id?: string
          keys?: Json | null
          p256dh?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json | null
          p256dh?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quran_bookmarks: {
        Row: {
          ayah_number: number
          created_at: string
          id: string
          surah_number: number
          user_id: string
        }
        Insert: {
          ayah_number: number
          created_at?: string
          id?: string
          surah_number: number
          user_id: string
        }
        Update: {
          ayah_number?: number
          created_at?: string
          id?: string
          surah_number?: number
          user_id?: string
        }
        Relationships: []
      }
      quran_reading_progress: {
        Row: {
          last_ayah: number
          last_surah: number
          updated_at: string
          user_id: string
        }
        Insert: {
          last_ayah?: number
          last_surah?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          last_ayah?: number
          last_surah?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quran_recitations: {
        Row: {
          audio_path: string
          ayah_timings: Json
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          reciter_name: string
          reciter_name_ar: string | null
          surah_number: number
          updated_at: string
        }
        Insert: {
          audio_path: string
          ayah_timings?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          reciter_name: string
          reciter_name_ar?: string | null
          surah_number: number
          updated_at?: string
        }
        Update: {
          audio_path?: string
          ayah_timings?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          reciter_name?: string
          reciter_name_ar?: string | null
          surah_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      recitation_tests: {
        Row: {
          admin_approved: boolean | null
          admin_approved_at: string | null
          admin_notes: string | null
          ai_score: number | null
          ai_transcript: string | null
          assigned_page: number | null
          audio_path: string | null
          created_at: string | null
          final_level: string | null
          id: string
          stage: number | null
          stage1_submitted_at: string | null
          stage2_completed_at: string | null
          stage3_completed_at: string | null
          stage3_requested_at: string | null
          stage3_session_date: string | null
          status: string | null
          teacher_notes: string | null
          teacher_score: number | null
          user_id: string | null
          virtual_session_booked_at: string | null
          virtual_session_date: string | null
          virtual_session_notes: string | null
          virtual_session_time: string | null
        }
        Insert: {
          admin_approved?: boolean | null
          admin_approved_at?: string | null
          admin_notes?: string | null
          ai_score?: number | null
          ai_transcript?: string | null
          assigned_page?: number | null
          audio_path?: string | null
          created_at?: string | null
          final_level?: string | null
          id?: string
          stage?: number | null
          stage1_submitted_at?: string | null
          stage2_completed_at?: string | null
          stage3_completed_at?: string | null
          stage3_requested_at?: string | null
          stage3_session_date?: string | null
          status?: string | null
          teacher_notes?: string | null
          teacher_score?: number | null
          user_id?: string | null
          virtual_session_booked_at?: string | null
          virtual_session_date?: string | null
          virtual_session_notes?: string | null
          virtual_session_time?: string | null
        }
        Update: {
          admin_approved?: boolean | null
          admin_approved_at?: string | null
          admin_notes?: string | null
          ai_score?: number | null
          ai_transcript?: string | null
          assigned_page?: number | null
          audio_path?: string | null
          created_at?: string | null
          final_level?: string | null
          id?: string
          stage?: number | null
          stage1_submitted_at?: string | null
          stage2_completed_at?: string | null
          stage3_completed_at?: string | null
          stage3_requested_at?: string | null
          stage3_session_date?: string | null
          status?: string | null
          teacher_notes?: string | null
          teacher_score?: number | null
          user_id?: string | null
          virtual_session_booked_at?: string | null
          virtual_session_date?: string | null
          virtual_session_notes?: string | null
          virtual_session_time?: string | null
        }
        Relationships: []
      }
      recording_bookmarks: {
        Row: {
          created_at: string | null
          id: string
          label: string | null
          recording_id: string
          student_id: string
          timestamp_seconds: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          label?: string | null
          recording_id: string
          student_id: string
          timestamp_seconds: number
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string | null
          recording_id?: string
          student_id?: string
          timestamp_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "recording_bookmarks_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "session_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_notes: {
        Row: {
          created_at: string | null
          id: string
          note_text: string
          recording_id: string
          student_id: string
          timestamp_seconds: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          note_text: string
          recording_id: string
          student_id: string
          timestamp_seconds: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          note_text?: string
          recording_id?: string
          student_id?: string
          timestamp_seconds?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recording_notes_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "session_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_watch_progress: {
        Row: {
          completed: boolean | null
          id: string
          last_watched_at: string | null
          progress_seconds: number | null
          recording_id: string
          student_id: string
          watch_count: number | null
        }
        Insert: {
          completed?: boolean | null
          id?: string
          last_watched_at?: string | null
          progress_seconds?: number | null
          recording_id: string
          student_id: string
          watch_count?: number | null
        }
        Update: {
          completed?: boolean | null
          id?: string
          last_watched_at?: string | null
          progress_seconds?: number | null
          recording_id?: string
          student_id?: string
          watch_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recording_watch_progress_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "session_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_flashcard_progress: {
        Row: {
          flashcard_id: string | null
          id: string
          last_reviewed_at: string | null
          status: string | null
          student_id: string
          times_reviewed: number | null
        }
        Insert: {
          flashcard_id?: string | null
          id?: string
          last_reviewed_at?: string | null
          status?: string | null
          student_id: string
          times_reviewed?: number | null
        }
        Update: {
          flashcard_id?: string | null
          id?: string
          last_reviewed_at?: string | null
          status?: string | null
          student_id?: string
          times_reviewed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "revision_flashcard_progress_flashcard_id_fkey"
            columns: ["flashcard_id"]
            isOneToOne: false
            referencedRelation: "revision_flashcards"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_flashcards: {
        Row: {
          back_text: string
          back_text_ar: string | null
          created_at: string | null
          created_by: string | null
          front_text: string
          front_text_ar: string | null
          id: string
          is_ai_generated: boolean | null
          level: string | null
          order_index: number | null
          room_id: string | null
          source_material_id: string | null
          subject_id: string | null
          topic: string | null
        }
        Insert: {
          back_text: string
          back_text_ar?: string | null
          created_at?: string | null
          created_by?: string | null
          front_text: string
          front_text_ar?: string | null
          id?: string
          is_ai_generated?: boolean | null
          level?: string | null
          order_index?: number | null
          room_id?: string | null
          source_material_id?: string | null
          subject_id?: string | null
          topic?: string | null
        }
        Update: {
          back_text?: string
          back_text_ar?: string | null
          created_at?: string | null
          created_by?: string | null
          front_text?: string
          front_text_ar?: string | null
          id?: string
          is_ai_generated?: boolean | null
          level?: string | null
          order_index?: number | null
          room_id?: string | null
          source_material_id?: string | null
          subject_id?: string | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revision_flashcards_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "revision_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_flashcards_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_notes: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          is_private: boolean | null
          session_id: string | null
          student_id: string
          subject_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_private?: boolean | null
          session_id?: string | null
          student_id: string
          subject_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_private?: boolean | null
          session_id?: string | null
          student_id?: string
          subject_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revision_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_notes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_quiz_sessions: {
        Row: {
          answers: Json | null
          completed_at: string | null
          id: string
          percentage: number | null
          room_id: string | null
          score: number | null
          source: string | null
          student_id: string
          subject_id: string | null
          total: number | null
        }
        Insert: {
          answers?: Json | null
          completed_at?: string | null
          id?: string
          percentage?: number | null
          room_id?: string | null
          score?: number | null
          source?: string | null
          student_id: string
          subject_id?: string | null
          total?: number | null
        }
        Update: {
          answers?: Json | null
          completed_at?: string | null
          id?: string
          percentage?: number | null
          room_id?: string | null
          score?: number | null
          source?: string | null
          student_id?: string
          subject_id?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "revision_quiz_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "revision_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_quiz_sessions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_room_members: {
        Row: {
          id: string
          joined_at: string | null
          room_id: string | null
          student_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          room_id?: string | null
          student_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          room_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revision_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "revision_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_rooms: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          description_ar: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean | null
          level: string | null
          max_students: number | null
          scheduled_at: string | null
          subject_id: string | null
          title: string
          title_ar: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          level?: string | null
          max_students?: number | null
          scheduled_at?: string | null
          subject_id?: string | null
          title: string
          title_ar?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          level?: string | null
          max_students?: number | null
          scheduled_at?: string | null
          subject_id?: string | null
          title?: string
          title_ar?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revision_rooms_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_schedule: {
        Row: {
          created_at: string | null
          duration_minutes: number | null
          id: string
          is_completed: boolean | null
          reminder_sent: boolean | null
          revision_type: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          student_id: string
          subject_id: string | null
        }
        Insert: {
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_completed?: boolean | null
          reminder_sent?: boolean | null
          revision_type?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          student_id: string
          subject_id?: string | null
        }
        Update: {
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_completed?: boolean | null
          reminder_sent?: boolean | null
          revision_type?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          student_id?: string
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revision_schedule_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_summaries: {
        Row: {
          content: string
          content_ar: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_ai_generated: boolean | null
          level: string | null
          session_id: string | null
          subject_id: string | null
          title: string
          title_ar: string | null
          topic: string | null
          type: string | null
        }
        Insert: {
          content: string
          content_ar?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_ai_generated?: boolean | null
          level?: string | null
          session_id?: string | null
          subject_id?: string | null
          title: string
          title_ar?: string | null
          topic?: string | null
          type?: string | null
        }
        Update: {
          content?: string
          content_ar?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_ai_generated?: boolean | null
          level?: string | null
          session_id?: string | null
          subject_id?: string | null
          title?: string
          title_ar?: string | null
          topic?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revision_summaries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_summaries_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
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
      session_homework: {
        Row: {
          created_at: string | null
          description: string | null
          description_ar: string | null
          due_date: string | null
          grade: number | null
          id: string
          session_id: string | null
          status: string | null
          student_id: string
          subject_id: string | null
          submission_notes: string | null
          submission_url: string | null
          teacher_feedback: string | null
          teacher_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          description_ar?: string | null
          due_date?: string | null
          grade?: number | null
          id?: string
          session_id?: string | null
          status?: string | null
          student_id: string
          subject_id?: string | null
          submission_notes?: string | null
          submission_url?: string | null
          teacher_feedback?: string | null
          teacher_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          description_ar?: string | null
          due_date?: string | null
          grade?: number | null
          id?: string
          session_id?: string | null
          status?: string | null
          student_id?: string
          subject_id?: string | null
          submission_notes?: string | null
          submission_url?: string | null
          teacher_feedback?: string | null
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_homework_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_homework_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      session_ratings: {
        Row: {
          created_at: string | null
          id: string
          session_id: string | null
          stars: number
          student_id: string | null
          subject_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          session_id?: string | null
          stars: number
          student_id?: string | null
          subject_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          session_id?: string | null
          stars?: number
          student_id?: string | null
          subject_id?: string | null
        }
        Relationships: []
      }
      session_recordings: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          egress_id: string | null
          file_size: number | null
          file_url: string | null
          id: string
          session_id: string
          status: string
          subject_id: string
          teacher_name: string | null
          thumbnail_url: string | null
          visibility: string
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          egress_id?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          session_id: string
          status?: string
          subject_id: string
          teacher_name?: string | null
          thumbnail_url?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          egress_id?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          session_id?: string
          status?: string
          subject_id?: string
          teacher_name?: string | null
          thumbnail_url?: string | null
          visibility?: string
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
          announcement_notifications: boolean | null
          autoplay_recordings: boolean | null
          class_reminder: boolean | null
          class_reminder_minutes: number | null
          compact_timetable: boolean | null
          created_at: string | null
          dark_mode: boolean | null
          default_subject_view: string | null
          email_notifications: boolean | null
          exam_reminder: boolean | null
          exam_submission_alert: boolean | null
          grading_reminder: boolean | null
          id: string
          language: string | null
          new_recording_alert: boolean | null
          new_student_assignment: boolean | null
          playback_speed: string | null
          results_notification: boolean | null
          session_booking_alert: boolean | null
          show_profile_photo: boolean | null
          show_student_details: boolean | null
          show_subtitles: boolean | null
          student_message_alert: boolean | null
          text_direction: string | null
          updated_at: string | null
          user_id: string
          whatsapp_notifications: boolean | null
        }
        Insert: {
          announcement_notifications?: boolean | null
          autoplay_recordings?: boolean | null
          class_reminder?: boolean | null
          class_reminder_minutes?: number | null
          compact_timetable?: boolean | null
          created_at?: string | null
          dark_mode?: boolean | null
          default_subject_view?: string | null
          email_notifications?: boolean | null
          exam_reminder?: boolean | null
          exam_submission_alert?: boolean | null
          grading_reminder?: boolean | null
          id?: string
          language?: string | null
          new_recording_alert?: boolean | null
          new_student_assignment?: boolean | null
          playback_speed?: string | null
          results_notification?: boolean | null
          session_booking_alert?: boolean | null
          show_profile_photo?: boolean | null
          show_student_details?: boolean | null
          show_subtitles?: boolean | null
          student_message_alert?: boolean | null
          text_direction?: string | null
          updated_at?: string | null
          user_id: string
          whatsapp_notifications?: boolean | null
        }
        Update: {
          announcement_notifications?: boolean | null
          autoplay_recordings?: boolean | null
          class_reminder?: boolean | null
          class_reminder_minutes?: number | null
          compact_timetable?: boolean | null
          created_at?: string | null
          dark_mode?: boolean | null
          default_subject_view?: string | null
          email_notifications?: boolean | null
          exam_reminder?: boolean | null
          exam_submission_alert?: boolean | null
          grading_reminder?: boolean | null
          id?: string
          language?: string | null
          new_recording_alert?: boolean | null
          new_student_assignment?: boolean | null
          playback_speed?: string | null
          results_notification?: boolean | null
          session_booking_alert?: boolean | null
          show_profile_photo?: boolean | null
          show_student_details?: boolean | null
          show_subtitles?: boolean | null
          student_message_alert?: boolean | null
          text_direction?: string | null
          updated_at?: string | null
          user_id?: string
          whatsapp_notifications?: boolean | null
        }
        Relationships: []
      }
      student_subject_enrollments: {
        Row: {
          disenrolled_at: string | null
          enrolled_at: string
          id: string
          is_compulsory: boolean
          level: string
          status: string
          student_id: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          disenrolled_at?: string | null
          enrolled_at?: string
          id?: string
          is_compulsory?: boolean
          level: string
          status?: string
          student_id: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          disenrolled_at?: string | null
          enrolled_at?: string
          id?: string
          is_compulsory?: boolean
          level?: string
          status?: string
          student_id?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_subject_enrollments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      student_subscriptions: {
        Row: {
          auto_renew: boolean | null
          count_from_date: string | null
          created_at: string | null
          end_date: string | null
          id: string
          payment_id: string | null
          paystack_subscription_code: string | null
          plan_id: string | null
          start_date: string | null
          status: string | null
          student_id: string
        }
        Insert: {
          auto_renew?: boolean | null
          count_from_date?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          payment_id?: string | null
          paystack_subscription_code?: string | null
          plan_id?: string | null
          start_date?: string | null
          status?: string | null
          student_id: string
        }
        Update: {
          auto_renew?: boolean | null
          count_from_date?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          payment_id?: string | null
          paystack_subscription_code?: string | null
          plan_id?: string | null
          start_date?: string | null
          status?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_subscriptions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_subscriptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
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
          allow_audio: boolean | null
          allow_file: boolean | null
          allow_text: boolean | null
          created_at: string | null
          created_by: string
          deadline: string | null
          description: string | null
          description_ar: string | null
          file_url: string | null
          id: string
          max_score: number | null
          question: string | null
          question_ar: string | null
          status: string | null
          subject_id: string
          title: string
          title_ar: string | null
        }
        Insert: {
          allow_audio?: boolean | null
          allow_file?: boolean | null
          allow_text?: boolean | null
          created_at?: string | null
          created_by: string
          deadline?: string | null
          description?: string | null
          description_ar?: string | null
          file_url?: string | null
          id?: string
          max_score?: number | null
          question?: string | null
          question_ar?: string | null
          status?: string | null
          subject_id: string
          title: string
          title_ar?: string | null
        }
        Update: {
          allow_audio?: boolean | null
          allow_file?: boolean | null
          allow_text?: boolean | null
          created_at?: string | null
          created_by?: string
          deadline?: string | null
          description?: string | null
          description_ar?: string | null
          file_url?: string | null
          id?: string
          max_score?: number | null
          question?: string | null
          question_ar?: string | null
          status?: string | null
          subject_id?: string
          title?: string
          title_ar?: string | null
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
          description: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_downloadable: boolean | null
          level: string | null
          material_type: string | null
          session_id: string | null
          sort_order: number | null
          subject_id: string
          sync_allowed: boolean
          title: string
          title_ar: string | null
          topic: string | null
          updated_at: string
          uploaded_by: string
          visibility: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_downloadable?: boolean | null
          level?: string | null
          material_type?: string | null
          session_id?: string | null
          sort_order?: number | null
          subject_id: string
          sync_allowed?: boolean
          title: string
          title_ar?: string | null
          topic?: string | null
          updated_at?: string
          uploaded_by: string
          visibility?: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_downloadable?: boolean | null
          level?: string | null
          material_type?: string | null
          session_id?: string | null
          sort_order?: number | null
          subject_id?: string
          sync_allowed?: boolean
          title?: string
          title_ar?: string | null
          topic?: string | null
          updated_at?: string
          uploaded_by?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_materials_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_materials_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_opt_outs: {
        Row: {
          created_at: string
          id: string
          student_id: string
          subject_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          student_id: string
          subject_id: string
        }
        Update: {
          created_at?: string
          id?: string
          student_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_opt_outs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "subject_opt_outs_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_registrations: {
        Row: {
          id: string
          registered_at: string
          subject_id: string
          user_id: string
        }
        Insert: {
          id?: string
          registered_at?: string
          subject_id: string
          user_id: string
        }
        Update: {
          id?: string
          registered_at?: string
          subject_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_registrations_subject_id_fkey"
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
      subject_timetable: {
        Row: {
          created_at: string | null
          created_by: string | null
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean | null
          levels: string[] | null
          live_url: string | null
          notes: string | null
          start_time: string
          subject_id: string
          teacher_id: string | null
          teacher_ids: string[] | null
          updated_at: string | null
          visibility: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean | null
          levels?: string[] | null
          live_url?: string | null
          notes?: string | null
          start_time: string
          subject_id: string
          teacher_id?: string | null
          teacher_ids?: string[] | null
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean | null
          levels?: string[] | null
          live_url?: string | null
          notes?: string | null
          start_time?: string
          subject_id?: string
          teacher_id?: string | null
          teacher_ids?: string[] | null
          updated_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_timetable_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_whiteboard: {
        Row: {
          strokes: Json | null
          subject_id: string
          updated_at: string | null
        }
        Insert: {
          strokes?: Json | null
          subject_id: string
          updated_at?: string | null
        }
        Update: {
          strokes?: Json | null
          subject_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subject_whiteboard_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: true
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          course_id: string | null
          course_syllabus: string | null
          course_syllabus_ar: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          description_ar: string | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_compulsory: boolean
          level: string | null
          levels: string[] | null
          livekit_room_name: string | null
          materials_locked: boolean
          next_session_at: string | null
          session_day: string | null
          session_duration: number | null
          session_time: string | null
          sessions_per_week: number | null
          teacher_id: string | null
          title: string
          title_ar: string | null
          total_sessions: number | null
          updated_at: string | null
          visibility: string
        }
        Insert: {
          course_id?: string | null
          course_syllabus?: string | null
          course_syllabus_ar?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_compulsory?: boolean
          level?: string | null
          levels?: string[] | null
          livekit_room_name?: string | null
          materials_locked?: boolean
          next_session_at?: string | null
          session_day?: string | null
          session_duration?: number | null
          session_time?: string | null
          sessions_per_week?: number | null
          teacher_id?: string | null
          title: string
          title_ar?: string | null
          total_sessions?: number | null
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          course_id?: string | null
          course_syllabus?: string | null
          course_syllabus_ar?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_compulsory?: boolean
          level?: string | null
          levels?: string[] | null
          livekit_room_name?: string | null
          materials_locked?: boolean
          next_session_at?: string | null
          session_day?: string | null
          session_duration?: number | null
          session_time?: string | null
          sessions_per_week?: number | null
          teacher_id?: string | null
          title?: string
          title_ar?: string | null
          total_sessions?: number | null
          updated_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          created_at: string | null
          id: string
          message: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          sender_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          status: string | null
          student_id: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          student_id: string
          subject: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          student_id?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tasjeel_progress: {
        Row: {
          admin_approved_at: string | null
          admin_notes: string | null
          completed_at: string | null
          created_at: string | null
          current_step: string
          exam_attempt_id: string | null
          exam_completed_at: string | null
          id: string
          level_assigned: string | null
          level_assigned_at: string | null
          onboarding_completed_at: string | null
          payment_amount: number | null
          payment_currency: string | null
          payment_paid_at: string | null
          payment_ref: string | null
          payment_status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_approved_at?: string | null
          admin_notes?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: string
          exam_attempt_id?: string | null
          exam_completed_at?: string | null
          id?: string
          level_assigned?: string | null
          level_assigned_at?: string | null
          onboarding_completed_at?: string | null
          payment_amount?: number | null
          payment_currency?: string | null
          payment_paid_at?: string | null
          payment_ref?: string | null
          payment_status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_approved_at?: string | null
          admin_notes?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: string
          exam_attempt_id?: string | null
          exam_completed_at?: string | null
          id?: string
          level_assigned?: string | null
          level_assigned_at?: string | null
          onboarding_completed_at?: string | null
          payment_amount?: number | null
          payment_currency?: string | null
          payment_paid_at?: string | null
          payment_ref?: string | null
          payment_status?: string | null
          updated_at?: string | null
          user_id?: string
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
      teacher_bank_accounts: {
        Row: {
          account_name: string | null
          account_number: string
          bank_code: string
          bank_name: string
          created_at: string
          currency: string
          id: string
          is_verified: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string | null
          account_number: string
          bank_code: string
          bank_name: string
          created_at?: string
          currency?: string
          id?: string
          is_verified?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string | null
          account_number?: string
          bank_code?: string
          bank_name?: string
          created_at?: string
          currency?: string
          id?: string
          is_verified?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      teacher_course_assignments: {
        Row: {
          course_id: string | null
          id: string
          teacher_id: string | null
        }
        Insert: {
          course_id?: string | null
          id?: string
          teacher_id?: string | null
        }
        Update: {
          course_id?: string | null
          id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_course_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_course_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      teacher_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          notes: string | null
          paid_by: string | null
          payment_date: string
          payment_method: string
          payment_type: string
          period: string | null
          receipt_url: string | null
          reference: string | null
          status: string
          teacher_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          paid_by?: string | null
          payment_date?: string
          payment_method?: string
          payment_type?: string
          period?: string | null
          receipt_url?: string | null
          reference?: string | null
          status?: string
          teacher_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          paid_by?: string | null
          payment_date?: string
          payment_method?: string
          payment_type?: string
          period?: string | null
          receipt_url?: string | null
          reference?: string | null
          status?: string
          teacher_id?: string
        }
        Relationships: []
      }
      teacher_preferences: {
        Row: {
          announcement_notifications: boolean | null
          autoplay_recordings: boolean | null
          class_reminder: boolean | null
          compact_timetable: boolean | null
          created_at: string | null
          dark_mode: boolean | null
          default_subject_view: string | null
          email_notifications: boolean | null
          exam_submission_alert: boolean | null
          grading_reminder: boolean | null
          id: string
          language: string | null
          new_recording_alert: boolean | null
          new_student_assignment: boolean | null
          playback_speed: string | null
          session_booking_alert: boolean | null
          show_student_details: boolean | null
          student_message_alert: boolean | null
          updated_at: string | null
          user_id: string
          whatsapp_notifications: boolean | null
        }
        Insert: {
          announcement_notifications?: boolean | null
          autoplay_recordings?: boolean | null
          class_reminder?: boolean | null
          compact_timetable?: boolean | null
          created_at?: string | null
          dark_mode?: boolean | null
          default_subject_view?: string | null
          email_notifications?: boolean | null
          exam_submission_alert?: boolean | null
          grading_reminder?: boolean | null
          id?: string
          language?: string | null
          new_recording_alert?: boolean | null
          new_student_assignment?: boolean | null
          playback_speed?: string | null
          session_booking_alert?: boolean | null
          show_student_details?: boolean | null
          student_message_alert?: boolean | null
          updated_at?: string | null
          user_id: string
          whatsapp_notifications?: boolean | null
        }
        Update: {
          announcement_notifications?: boolean | null
          autoplay_recordings?: boolean | null
          class_reminder?: boolean | null
          compact_timetable?: boolean | null
          created_at?: string | null
          dark_mode?: boolean | null
          default_subject_view?: string | null
          email_notifications?: boolean | null
          exam_submission_alert?: boolean | null
          grading_reminder?: boolean | null
          id?: string
          language?: string | null
          new_recording_alert?: boolean | null
          new_student_assignment?: boolean | null
          playback_speed?: string | null
          session_booking_alert?: boolean | null
          show_student_details?: boolean | null
          student_message_alert?: boolean | null
          updated_at?: string | null
          user_id?: string
          whatsapp_notifications?: boolean | null
        }
        Relationships: []
      }
      teacher_profiles: {
        Row: {
          accepts_group: boolean | null
          accepts_private: boolean | null
          available_days: string[] | null
          available_times: string[] | null
          created_at: string | null
          id: string
          levels_taught: string[] | null
          max_students: number | null
          qualifications: string | null
          session_duration: number | null
          specializations: string[] | null
          teaching_bio: string | null
          updated_at: string | null
          user_id: string
          years_experience: string | null
        }
        Insert: {
          accepts_group?: boolean | null
          accepts_private?: boolean | null
          available_days?: string[] | null
          available_times?: string[] | null
          created_at?: string | null
          id?: string
          levels_taught?: string[] | null
          max_students?: number | null
          qualifications?: string | null
          session_duration?: number | null
          specializations?: string[] | null
          teaching_bio?: string | null
          updated_at?: string | null
          user_id: string
          years_experience?: string | null
        }
        Update: {
          accepts_group?: boolean | null
          accepts_private?: boolean | null
          available_days?: string[] | null
          available_times?: string[] | null
          created_at?: string | null
          id?: string
          levels_taught?: string[] | null
          max_students?: number | null
          qualifications?: string | null
          session_duration?: number | null
          specializations?: string[] | null
          teaching_bio?: string | null
          updated_at?: string | null
          user_id?: string
          years_experience?: string | null
        }
        Relationships: []
      }
      teacher_recitations: {
        Row: {
          audio_url: string | null
          ayah_num: number | null
          created_at: string | null
          id: string
          surah_name: string | null
          surah_num: number | null
          teacher_id: string | null
          teacher_name: string | null
        }
        Insert: {
          audio_url?: string | null
          ayah_num?: number | null
          created_at?: string | null
          id?: string
          surah_name?: string | null
          surah_num?: number | null
          teacher_id?: string | null
          teacher_name?: string | null
        }
        Update: {
          audio_url?: string | null
          ayah_num?: number | null
          created_at?: string | null
          id?: string
          surah_name?: string | null
          surah_num?: number | null
          teacher_id?: string | null
          teacher_name?: string | null
        }
        Relationships: []
      }
      teacher_subject_assignments: {
        Row: {
          id: string
          subject_id: string | null
          teacher_id: string | null
        }
        Insert: {
          id?: string
          subject_id?: string | null
          teacher_id?: string | null
        }
        Update: {
          id?: string
          subject_id?: string | null
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_subject_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subject_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      telegram_bot_state: {
        Row: {
          id: number
          update_offset: number
          updated_at: string
        }
        Insert: {
          id: number
          update_offset?: number
          updated_at?: string
        }
        Update: {
          id?: number
          update_offset?: number
          updated_at?: string
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
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_hifdh_log: {
        Args: { p_log_id: string; p_note?: string }
        Returns: undefined
      }
      admin_advance_hifdh_revision_daily: { Args: never; Returns: number }
      admin_bulk_assign_hifdh_revision: {
        Args: {
          p_auto_progress?: boolean
          p_daily_pages: number
          p_mode: string
          p_notes?: string
          p_program_days?: number
          p_reciter_id?: string
          p_selected_items: number[]
          p_target_scope: string
          p_target_value: string
          p_weekend_off?: boolean
        }
        Returns: number
      }
      admin_delete_user_account: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      admin_force_submit_exam_attempt: {
        Args: { _attempt_id: string }
        Returns: Json
      }
      admin_grade_attempt: {
        Args: {
          _attempt_id: string
          _passing?: number
          _score: number
          _total: number
        }
        Returns: Json
      }
      admin_grant_exam_extra_time: {
        Args: { _attempt_id: string; _minutes: number }
        Returns: undefined
      }
      bulk_save_hifdh_assignment: {
        Args: {
          p_daily_pages: number
          p_mode: string
          p_notes?: string
          p_program_duration_days?: number
          p_program_start_date?: string
          p_reciter_id: string
          p_rest_days?: number[]
          p_selected_items: number[]
          p_start_page?: number
          p_student_ids: string[]
        }
        Returns: number
      }
      can_teacher_view_student: {
        Args: { p_student_id: string }
        Returns: boolean
      }
      claim_queue_box: {
        Args: {
          p_box_id: number
          p_competition_id: string
          p_participant_id: string
        }
        Returns: number
      }
      delete_own_account: { Args: never; Returns: undefined }
      extract_arabic_part: { Args: { txt: string }; Returns: string }
      extract_english_part: { Args: { txt: string }; Returns: string }
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
      get_subject_roster_ids: {
        Args: { p_subject_id: string }
        Returns: {
          user_id: string
        }[]
      }
      get_subject_teacher_ids: {
        Args: { p_subject_id: string }
        Returns: {
          user_id: string
        }[]
      }
      get_users_last_login: {
        Args: never
        Returns: {
          last_sign_in_at: string
          user_id: string
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
      is_chat_channel_admin: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_chat_channel_member: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_gm_judge: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      mark_notifications_read: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      remind_admins_unreviewed_students: { Args: never; Returns: number }
      review_hifdh_daily_log: {
        Args: { p_avg_score: number; p_log_id: string; p_session_data: Json }
        Returns: Json
      }
      save_hifdh_assignment:
        | {
            Args: {
              p_assigned_by?: string
              p_daily_pages: number
              p_mode: string
              p_notes?: string
              p_reciter_id?: string
              p_selected_items: number[]
              p_student_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_daily_pages: number
              p_mode: string
              p_notes?: string
              p_program_duration_days?: number
              p_program_start_date?: string
              p_reciter_id: string
              p_rest_days?: number[]
              p_selected_items: number[]
              p_start_page?: number
              p_student_id: string
            }
            Returns: string
          }
      set_subject_enrollment: {
        Args: { p_active: boolean; p_subject_id: string }
        Returns: {
          disenrolled_at: string | null
          enrolled_at: string
          id: string
          is_compulsory: boolean
          level: string
          status: string
          student_id: string
          subject_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "student_subject_enrollments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_level_enrollments: {
        Args: { p_level: string; p_student_id: string }
        Returns: undefined
      }
      upsert_hifdh_daily_log: {
        Args: {
          p_assignment_id: string
          p_completed: boolean
          p_duration: number
          p_pages: number
          p_score: number
          p_session_data: Json
          p_student_id: string
        }
        Returns: string
      }
      upsert_student_notifications: {
        Args: { p_notifications: Json; p_user_id: string }
        Returns: undefined
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
