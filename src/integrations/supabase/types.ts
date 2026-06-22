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
      games: {
        Row: {
          api_fixture_id: number | null
          api_league_id: number | null
          api_season: number | null
          away_team_api_id: number | null
          closed: boolean
          created_at: string
          home_team_api_id: number | null
          id: string
          last_sync: string | null
          match_at: string
          minutes: number[]
          round: string | null
          score_away: number | null
          score_home: number | null
          scorer: string | null
          scorer_player_ids: number[]
          scorer_team_ids: number[]
          scorers: string[]
          stage: string | null
          status: string | null
          team_away: string
          team_home: string
        }
        Insert: {
          api_fixture_id?: number | null
          api_league_id?: number | null
          api_season?: number | null
          away_team_api_id?: number | null
          closed?: boolean
          created_at?: string
          home_team_api_id?: number | null
          id?: string
          last_sync?: string | null
          match_at: string
          minutes?: number[]
          round?: string | null
          score_away?: number | null
          score_home?: number | null
          scorer?: string | null
          scorer_player_ids?: number[]
          scorer_team_ids?: number[]
          scorers?: string[]
          stage?: string | null
          status?: string | null
          team_away: string
          team_home: string
        }
        Update: {
          api_fixture_id?: number | null
          api_league_id?: number | null
          api_season?: number | null
          away_team_api_id?: number | null
          closed?: boolean
          created_at?: string
          home_team_api_id?: number | null
          id?: string
          last_sync?: string | null
          match_at?: string
          minutes?: number[]
          round?: string | null
          score_away?: number | null
          score_home?: number | null
          scorer?: string | null
          scorer_player_ids?: number[]
          scorer_team_ids?: number[]
          scorers?: string[]
          stage?: string | null
          status?: string | null
          team_away?: string
          team_home?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          age: number | null
          api_player_id: number
          created_at: string
          height: string | null
          id: string
          name: string
          nationality: string | null
          photo: string | null
          position: string | null
          team_id: number | null
          team_name: string | null
          updated_at: string
          weight: string | null
        }
        Insert: {
          age?: number | null
          api_player_id: number
          created_at?: string
          height?: string | null
          id?: string
          name: string
          nationality?: string | null
          photo?: string | null
          position?: string | null
          team_id?: number | null
          team_name?: string | null
          updated_at?: string
          weight?: string | null
        }
        Update: {
          age?: number | null
          api_player_id?: number
          created_at?: string
          height?: string | null
          id?: string
          name?: string
          nationality?: string | null
          photo?: string | null
          position?: string | null
          team_id?: number | null
          team_name?: string | null
          updated_at?: string
          weight?: string | null
        }
        Relationships: []
      }
      predictions: {
        Row: {
          created_at: string
          game_id: string
          guess_away: number
          guess_home: number
          guess_minutes: number[]
          guess_scorer: string | null
          guess_scorer_player_ids: number[]
          guess_scorers: string[]
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          guess_away: number
          guess_home: number
          guess_minutes?: number[]
          guess_scorer?: string | null
          guess_scorer_player_ids?: number[]
          guess_scorers?: string[]
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          guess_away?: number
          guess_home?: number
          guess_minutes?: number[]
          guess_scorer?: string | null
          guess_scorer_player_ids?: number[]
          guess_scorers?: string[]
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      season_predictions: {
        Row: {
          artilheiro: string | null
          campeao: string | null
          created_at: string
          selecao_carisma: string | null
          time_revelacao: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          artilheiro?: string | null
          campeao?: string | null
          created_at?: string
          selecao_carisma?: string | null
          time_revelacao?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          artilheiro?: string | null
          campeao?: string | null
          created_at?: string
          selecao_carisma?: string | null
          time_revelacao?: string | null
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
    }
    Views: {
      rankings: {
        Row: {
          a_count: number | null
          display_name: string | null
          m_count: number | null
          p_count: number | null
          points: number | null
          user_id: string | null
          v_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      count_minute_matches: {
        Args: { guess_minutes: number[]; real_minutes: number[] }
        Returns: number
      }
      count_scorer_matches: {
        Args: {
          guess_player_ids: number[]
          guess_scorers: string[]
          real_player_ids: number[]
          real_scorers: string[]
        }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
