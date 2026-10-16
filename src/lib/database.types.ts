
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "groups": {
                  Row: {
                    "calendar_enabled": boolean,"created_at": string,"created_by": string | null,"id": string,"invite_code": string,"name": string,"shopping_enabled": boolean,"timezone": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "calendar_enabled"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invite_code"?: string,"name": string,"shopping_enabled"?: boolean,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "calendar_enabled"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invite_code"?: string,"name"?: string,"shopping_enabled"?: boolean,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "groups_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"items": {
                  Row: {
                    "added_at": string,"added_by": string | null,"group_id": string,"id": string,"name": string,"note": string | null,"photo_path": string | null,"purchased_at": string | null,"purchased_by": string | null,"quantity": number,"status": Database["public"]['Enums']["item_status"],"trip_id": string | null
                  }
                  Insert: {
                    "added_at"?: string,"added_by"?: string | null,"group_id": string,"id"?: string,"name": string,"note"?: string | null,"photo_path"?: string | null,"purchased_at"?: string | null,"purchased_by"?: string | null,"quantity"?: number,"status"?: Database["public"]['Enums']["item_status"],"trip_id"?: string | null
                  }
                  Update: {
                    "added_at"?: string,"added_by"?: string | null,"group_id"?: string,"id"?: string,"name"?: string,"note"?: string | null,"photo_path"?: string | null,"purchased_at"?: string | null,"purchased_by"?: string | null,"quantity"?: number,"status"?: Database["public"]['Enums']["item_status"],"trip_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_purchased_by_fkey"
      columns: ["purchased_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"members": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"created_at": string,"group_id": string,"id": string,"left_at": string | null,"person_id": string,"role": string,"status": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"group_id": string,"id"?: string,"left_at"?: string | null,"person_id": string,"role"?: string,"status"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"group_id"?: string,"id"?: string,"left_at"?: string | null,"person_id"?: string,"role"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "members_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"people": {
                  Row: {
                    "claim_code": string | null,"color": string,"created_at": string,"created_by": string | null,"display_name": string,"id": string,"updated_at": string,"updated_by": string | null,"user_id": string | null
                  }
                  Insert: {
                    "claim_code"?: string | null,"color"?: string,"created_at"?: string,"created_by"?: string | null,"display_name": string,"id"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "claim_code"?: string | null,"color"?: string,"created_at"?: string,"created_by"?: string | null,"display_name"?: string,"id"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "people_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "people_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "display_name": string,"group_id": string,"id": string,"last_quantity": number,"normalized_name": string,"times_used": number,"updated_at": string
                  }
                  Insert: {
                    "display_name": string,"group_id": string,"id"?: string,"last_quantity"?: number,"normalized_name": string,"times_used"?: number,"updated_at"?: string
                  }
                  Update: {
                    "display_name"?: string,"group_id"?: string,"id"?: string,"last_quantity"?: number,"normalized_name"?: string,"times_used"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"trips": {
                  Row: {
                    "closed_reason": string | null,"finished_at": string | null,"group_id": string,"id": string,"member_id": string,"started_at": string
                  }
                  Insert: {
                    "closed_reason"?: string | null,"finished_at"?: string | null,"group_id": string,"id"?: string,"member_id": string,"started_at"?: string
                  }
                  Update: {
                    "closed_reason"?: string | null,"finished_at"?: string | null,"group_id"?: string,"id"?: string,"member_id"?: string,"started_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trips_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trips_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "approve_member":
{ Args: { "member_id": string }; Returns: undefined
                           },
"can_manage_person":
{ Args: { "pid": string }; Returns: boolean
                           },
"can_see_person":
{ Args: { "pid": string }; Returns: boolean
                           },
"can_use_group_folder":
{ Args: { "object_name": string }; Returns: boolean
                           },
"cancel_trip":
{ Args: { "trip_id": string }; Returns: undefined
                           },
"claim_profile":
{ Args: { "code": string }; Returns: string
                           },
"close_stale_trips":
{ Args: { "max_age"?: string }; Returns: number
                           },
"close_trip":
{ Args: { "reason": string,"target_trip_id": string }; Returns: number
                           },
"create_claim_code":
{ Args: { "pid": string }; Returns: string
                           },
"create_group":
{ Args: { "group_name": string,"with_calendar"?: boolean,"with_shopping"?: boolean }; Returns: string
                           },
"create_profile":
{ Args: { "display_name": string,"gid": string }; Returns: string
                           },
"finish_trip":
{ Args: { "trip_id": string }; Returns: number
                           },
"generate_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"group_by_invite":
{ Args: { "code": string }; Returns: {
              "id": string,"member_count": number,"name": string
            }[]
                           },
"is_group_admin":
{ Args: { "gid": string }; Returns: boolean
                           },
"is_group_member":
{ Args: { "gid": string }; Returns: boolean
                           },
"leave_group":
{ Args: { "gid": string }; Returns: undefined
                           },
"merge_item":
{ Args: { "add_quantity": number,"extra_note"?: string,"item_id": string }; Returns: {
              "added_at": string,
"added_by": string | null,
"group_id": string,
"id": string,
"name": string,
"note": string | null,
"photo_path": string | null,
"purchased_at": string | null,
"purchased_by": string | null,
"quantity": number,
"status": Database["public"]['Enums']["item_status"],
"trip_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"my_member_id":
{ Args: { "gid": string }; Returns: string
                           },
"my_person_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"normalize_name":
{ Args: { "name": string }; Returns: string
                           },
"profile_by_claim_code":
{ Args: { "code": string }; Returns: {
              "display_name": string,"id": string
            }[]
                           },
"random_person_color":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"regenerate_invite_code":
{ Args: { "gid": string }; Returns: string
                           },
"reject_member":
{ Args: { "member_id": string }; Returns: undefined
                           },
"remember_product":
{ Args: { "gid": string,"product_name": string,"quantity": number }; Returns: undefined
                           },
"remove_member":
{ Args: { "member_id": string }; Returns: undefined
                           },
"request_join":
{ Args: { "code": string }; Returns: string
                           },
"require_person":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"retire_member":
{ Args: { "target_member_id": string }; Returns: undefined
                           },
"set_member_role":
{ Args: { "member_id": string,"new_role": string }; Returns: undefined
                           }
          }
          Enums: {
            "item_status": "pending"|"in_cart"|"purchased"|"not_found"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "item_status": ["pending", "in_cart", "purchased", "not_found"]
          }
        }
} as const

