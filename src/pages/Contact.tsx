import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, MapPin, Send } from "lucide-react";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email"),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  message: z.string().trim().min(1, "Message is required").max(2000),
});

const Contact = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = contactSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => { if (err.path[0]) fieldErrors[err.path[0] as string] = err.message; });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    toast({ title: t("Message sent!", "تم إرسال الرسالة!"), description: t("We'll get back to you soon.", "سنعود إليك قريبًا.") });
    setForm({ name: "", email: "", subject: "", message: "" });
  };

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-bold">{t("Contact Us", "اتصل بنا")}</h1>
        <p className="text-muted-foreground">{t("We'd love to hear from you", "يسعدنا سماع رأيك")}</p>
      </div>

      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
        {/* Contact info */}
        <div className="space-y-4">
          {[
            { icon: Mail, label: t("Email", "البريد"), value: "info@tahleemacademy.com" },
            { icon: Phone, label: t("Phone", "الهاتف"), value: "+1 (555) 123-4567" },
            { icon: MapPin, label: t("Address", "العنوان"), value: t("123 Learning Lane, Education City", "123 طريق التعلم، مدينة التعليم") },
          ].map((item, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 p-4">
                <item.icon className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="text-sm font-medium">{item.value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Form */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t("Send a Message", "أرسل رسالة")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Input
                    placeholder={t("Your Name", "اسمك")}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                  {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
                </div>
                <div>
                  <Input
                    type="email"
                    placeholder={t("Email Address", "البريد الإلكتروني")}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
                </div>
              </div>
              <div>
                <Input
                  placeholder={t("Subject", "الموضوع")}
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
                {errors.subject && <p className="mt-1 text-xs text-destructive">{errors.subject}</p>}
              </div>
              <div>
                <Textarea
                  placeholder={t("Your Message", "رسالتك")}
                  rows={5}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                />
                {errors.message && <p className="mt-1 text-xs text-destructive">{errors.message}</p>}
              </div>
              <Button type="submit">
                <Send className="mr-2 h-4 w-4" />
                {t("Send Message", "إرسال الرسالة")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Contact;
