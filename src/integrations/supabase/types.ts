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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      branch_assignments: {
        Row: {
          created_at: string
          created_by: string
          employee_id: string
          end_date: string
          from_branch_id: string
          id: string
          reason: string
          start_date: string
          status: string
          to_branch_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          employee_id: string
          end_date: string
          from_branch_id: string
          id?: string
          reason?: string
          start_date: string
          status?: string
          to_branch_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          employee_id?: string
          end_date?: string
          from_branch_id?: string
          id?: string
          reason?: string
          start_date?: string
          status?: string
          to_branch_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_assignments_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_assignments_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          allowed_radius_meters: number
          branch_name: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          manager_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          allowed_radius_meters?: number
          branch_name: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          manager_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          allowed_radius_meters?: number
          branch_name?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          manager_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      check_ins: {
        Row: {
          attendance_status:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          branch_id: string | null
          check_in_time: string
          check_out_time: string | null
          created_at: string
          early_leave_minutes: number | null
          id: string
          image_url: string
          late_minutes: number | null
          shift_id: string | null
          status: boolean
          user_id: string
          verified: boolean | null
          verified_by: string | null
        }
        Insert: {
          attendance_status?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          branch_id?: string | null
          check_in_time?: string
          check_out_time?: string | null
          created_at?: string
          early_leave_minutes?: number | null
          id?: string
          image_url?: string
          late_minutes?: number | null
          shift_id?: string | null
          status?: boolean
          user_id: string
          verified?: boolean | null
          verified_by?: string | null
        }
        Update: {
          attendance_status?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          branch_id?: string | null
          check_in_time?: string
          check_out_time?: string | null
          created_at?: string
          early_leave_minutes?: number | null
          id?: string
          image_url?: string
          late_minutes?: number | null
          shift_id?: string | null
          status?: boolean
          user_id?: string
          verified?: boolean | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      early_checkout_requests: {
        Row: {
          approval_action_at: string | null
          approval_token: string | null
          branch_id: string | null
          check_in_id: string
          created_at: string
          employee_id: string
          id: string
          reason: string
          requested_at: string
          responded_at: string | null
          responded_by: string | null
          response_note: string | null
          shift_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approval_action_at?: string | null
          approval_token?: string | null
          branch_id?: string | null
          check_in_id: string
          created_at?: string
          employee_id: string
          id?: string
          reason?: string
          requested_at?: string
          responded_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          shift_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approval_action_at?: string | null
          approval_token?: string | null
          branch_id?: string | null
          check_in_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          reason?: string
          requested_at?: string
          responded_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          shift_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "early_checkout_requests_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      evaluations: {
        Row: {
          bonus_score: number
          branch_id: string | null
          categories_scores: Json
          created_at: string
          employee_id: string
          evaluation_date: string
          feedback_events: Json
          hr_id: string
          id: string
          manager_comment: string
          total_score: number
          updated_at: string
        }
        Insert: {
          bonus_score?: number
          branch_id?: string | null
          categories_scores?: Json
          created_at?: string
          employee_id: string
          evaluation_date?: string
          feedback_events?: Json
          hr_id: string
          id?: string
          manager_comment?: string
          total_score?: number
          updated_at?: string
        }
        Update: {
          bonus_score?: number
          branch_id?: string | null
          categories_scores?: Json
          created_at?: string
          employee_id?: string
          evaluation_date?: string
          feedback_events?: Json
          hr_id?: string
          id?: string
          manager_comment?: string
          total_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          subject: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          subject?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          subject?: string
          user_id?: string
        }
        Relationships: []
      }
      forgot_checkout_runs: {
        Row: {
          branch_id: string
          employee_count: number
          hr_count: number
          id: string
          report_date: string
          sent_at: string
        }
        Insert: {
          branch_id: string
          employee_count?: number
          hr_count?: number
          id?: string
          report_date: string
          sent_at?: string
        }
        Update: {
          branch_id?: string
          employee_count?: number
          hr_count?: number
          id?: string
          report_date?: string
          sent_at?: string
        }
        Relationships: []
      }
      hr_notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          related_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          branch_id: string | null
          created_at: string
          department: string | null
          email: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_edit_logs: {
        Row: {
          created_at: string
          edit_count: number
          edit_month: string
          edited_by: string
          employee_id: string
          id: string
          penalty_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          edit_count?: number
          edit_month: string
          edited_by: string
          employee_id: string
          id?: string
          penalty_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          edit_count?: number
          edit_month?: string
          edited_by?: string
          employee_id?: string
          id?: string
          penalty_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      shift_swap_requests: {
        Row: {
          created_at: string
          employee_id: string
          end_time: string | null
          from_branch_id: string
          id: string
          note: string
          request_type: string
          requested_by: string
          responded_at: string | null
          responded_by: string | null
          response_note: string | null
          shift_date: string
          shift_id: string | null
          shift_type: Database["public"]["Enums"]["shift_type"] | null
          start_time: string | null
          status: string
          to_branch_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          end_time?: string | null
          from_branch_id: string
          id?: string
          note?: string
          request_type?: string
          requested_by: string
          responded_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          shift_date: string
          shift_id?: string | null
          shift_type?: Database["public"]["Enums"]["shift_type"] | null
          start_time?: string | null
          status?: string
          to_branch_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          end_time?: string | null
          from_branch_id?: string
          id?: string
          note?: string
          request_type?: string
          requested_by?: string
          responded_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          shift_date?: string
          shift_id?: string | null
          shift_type?: Database["public"]["Enums"]["shift_type"] | null
          start_time?: string | null
          status?: string
          to_branch_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_swap_requests_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          actual_branch_id: string | null
          assignment_id: string | null
          created_at: string
          end_time: string
          id: string
          shift_date: string
          shift_type: Database["public"]["Enums"]["shift_type"]
          start_time: string
          swap_request_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_branch_id?: string | null
          assignment_id?: string | null
          created_at?: string
          end_time: string
          id?: string
          shift_date: string
          shift_type?: Database["public"]["Enums"]["shift_type"]
          start_time: string
          swap_request_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_branch_id?: string | null
          assignment_id?: string | null
          created_at?: string
          end_time?: string
          id?: string
          shift_date?: string
          shift_type?: Database["public"]["Enums"]["shift_type"]
          start_time?: string
          swap_request_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_actual_branch_id_fkey"
            columns: ["actual_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      swap_request_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          request_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          request_id: string
          sender_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          request_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_request_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "shift_swap_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_early_checkout_by_token: {
        Args: { _action: string; _token: string }
        Returns: Json
      }
      current_user_branch_id: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_employee_home_branch: {
        Args: { _employee_id: string }
        Returns: string
      }
      get_storage_usage: {
        Args: never
        Returns: {
          total_bytes: number
          total_files: number
        }[]
      }
      get_storage_usage_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          total_bytes: number
          total_files: number
        }[]
      }
      get_total_storage_usage: {
        Args: never
        Returns: {
          bucket_count: number
          total_bytes: number
          total_files: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_it_user: {
        Args: { _user_id: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "ADMIN" | "HR" | "EMPLOYEE" | "IT"
      attendance_status:
        | "on_time"
        | "late"
        | "early_leave"
        | "late_and_early"
        | "no_shift"
      shift_type: "PART_TIME_4H" | "FULL_TIME_8H"
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
      app_role: ["ADMIN", "HR", "EMPLOYEE", "IT"],
      attendance_status: [
        "on_time",
        "late",
        "early_leave",
        "late_and_early",
        "no_shift",
      ],
      shift_type: ["PART_TIME_4H", "FULL_TIME_8H"],
    },
  },
} as const
