// (imports remain unchanged)
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { BookOpen, Users, Plus, Edit, Trash2, Eye, EyeOff, GraduationCap } from "lucide-react";

const SUPABASE_URL = "https://wvqeubhupkddtkcdwqcm.supabase.co";
const LEVELS = ["beginner", "intermediate", "advanced"];

const emptyCourseForm = {
  title: "", title_ar: "", description: "", description_ar: "",
  level: "beginner", category: "", image_url: "", is_published: false,
  instructor_name: "", sort_order: 0,
};

const Courses = () => {
  const { t, language } = useLanguage();
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isAdmin = hasRole?.("admin") || hasRole?.("teacher");

  const [filter, setFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCourseForm);

  const { data: courses = [], isLoading, isError } = useQuery({
    queryKey: ["public-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const visibleCourses = courses.filter((c: any) => isAdmin || c.is_published);
  const filtered = filter === "all"
    ? visibleCourses
    : visibleCourses.filter((c: any) => c.level === filter);

  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setForm(emptyCourseForm);
  };

  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({ ...c });
    setDialogOpen(true);
  };

  const openAdd = () => {
    setEditId(null);
    setForm(emptyCourseForm);
    setDialogOpen(true);
  };

  return (
    <div className="container mx-auto px-4 py-16">

      <Helmet>
        <title>Courses</title>
      </Helmet>

      {/* Add button */}
      {isAdmin && (
        <div className="mb-6 flex justify-center">
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Course
          </Button>
        </div>
      )}

      {/* Loading */}
      {isLoading && <p>Loading...</p>}

      {/* Grid (FIXED HERE) */}
      {!isError && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((course: any, i: number) => (
            <motion.div key={course.id}>
              <Card>
                <CardContent>
                  <h3>{course.title}</h3>

                  {isAdmin && (
                    <div className="flex gap-2 mt-2">
                      <Button onClick={() => openEdit(course)}>
                        <Edit className="h-3 w-3" />
                      </Button>

                      <Button onClick={() => setDeleteId(course.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit" : "New"} Course</DialogTitle>
          </DialogHeader>

          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <Button onClick={() => console.log("save")}>
            Save
          </Button>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteId}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete?</AlertDialogTitle>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default Courses;