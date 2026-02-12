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
          title?: string
          title_ar?: string | null
          updated_at?: string
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
          is_published: boolean | null
          max_attempts: number | null
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
          time_limit_minutes: number | null
          title: string
          title_ar: string | null
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
          is_published?: boolean | null
          max_attempts?: number | null
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
          time_limit_minutes?: number | null
          title: string
          title_ar?: string | null
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
          is_published?: boolean | null
          max_attempts?: number | null
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
          time_limit_minutes?: number | null
          title?: string
          title_ar?: string | null
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
          avatar_url: string | null
          bio: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          preferred_language: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          preferred_language?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          preferred_language?: string | null
          updated_at?: string
          user_id?: string
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
