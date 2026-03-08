import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, Plus, Check, X } from "lucide-react";

interface ClassPollsProps {
  sessionId: string;
}

const ClassPolls = ({ sessionId }: ClassPollsProps) => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const [polls, setPolls] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, any[]>>({});
  const [myAnswers, setMyAnswers] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);

  useEffect(() => {
    const load = async () => {
      const { data: pollData } = await supabase
        .from("class_polls")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false });
      setPolls(pollData || []);

      if (pollData?.length) {
        const pollIds = pollData.map(p => p.id);
        const { data: ansData } = await supabase
          .from("class_poll_answers")
          .select("*")
          .in("poll_id", pollIds);

        const grouped: Record<string, any[]> = {};
        const mine: Record<string, number> = {};
        (ansData || []).forEach(a => {
          if (!grouped[a.poll_id]) grouped[a.poll_id] = [];
          grouped[a.poll_id].push(a);
          if (a.student_id === user?.id) mine[a.poll_id] = a.answer_index;
        });
        setAnswers(grouped);
        setMyAnswers(mine);
      }
    };
    load();

    const channel = supabase.channel(`polls-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "class_polls", filter: `session_id=eq.${sessionId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "class_poll_answers" }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, user?.id]);

  const createPoll = async () => {
    const validOptions = options.filter(o => o.trim());
    if (!question.trim() || validOptions.length < 2) return;
    await supabase.from("class_polls").insert({
      session_id: sessionId,
      question: question.trim(),
      options: validOptions.map((o, i) => ({ index: i, text: o.trim() })),
      created_by: user?.id,
    });
    setCreating(false);
    setQuestion("");
    setOptions(["", "", "", ""]);
  };

  const vote = async (pollId: string, index: number) => {
    if (!user || myAnswers[pollId] !== undefined) return;
    await supabase.from("class_poll_answers").insert({
      poll_id: pollId,
      student_id: user.id,
      answer_index: index,
    });
  };

  const endPoll = async (pollId: string) => {
    await supabase.from("class_polls").update({ is_active: false, show_results: true }).eq("id", pollId);
  };

  const toggleResults = async (pollId: string, current: boolean) => {
    await supabase.from("class_polls").update({ show_results: !current }).eq("id", pollId);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> {t("Polls", "التصويتات")}
        </h3>
        {isPrivileged && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreating(!creating)}>
            <Plus className="h-3 w-3" /> {t("New", "جديد")}
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {/* Create poll form */}
          {creating && isPrivileged && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <Input
                  placeholder={t("Question...", "السؤال...")}
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  className="text-sm"
                />
                {options.map((opt, i) => (
                  <Input
                    key={i}
                    placeholder={`${t("Option", "خيار")} ${i + 1}`}
                    value={opt}
                    onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }}
                    className="text-sm"
                  />
                ))}
                <div className="flex gap-2">
                  <Button size="sm" onClick={createPoll} className="flex-1">{t("Launch Poll", "إطلاق التصويت")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setCreating(false)}><X className="h-3 w-3" /></Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Polls list */}
          {polls.map(poll => {
            const pollAnswers = answers[poll.id] || [];
            const totalVotes = pollAnswers.length;
            const opts = (poll.options as any[]) || [];
            const hasVoted = myAnswers[poll.id] !== undefined;
            const showResults = poll.show_results || (isPrivileged && totalVotes > 0);

            return (
              <Card key={poll.id} className={!poll.is_active ? "opacity-60" : ""}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{poll.question}</p>
                    {poll.is_active ? (
                      <Badge className="bg-green-500/10 text-green-600 text-[10px]">{t("Active", "نشط")}</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">{t("Ended", "انتهى")}</Badge>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {opts.map((opt: any) => {
                      const count = pollAnswers.filter(a => a.answer_index === opt.index).length;
                      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                      const isSelected = myAnswers[poll.id] === opt.index;

                      return (
                        <div key={opt.index}>
                          {poll.is_active && !hasVoted ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-start text-sm h-8"
                              onClick={() => vote(poll.id, opt.index)}
                            >
                              {opt.text}
                            </Button>
                          ) : (
                            <div className="relative">
                              <div className="flex items-center justify-between text-xs mb-0.5">
                                <span className={isSelected ? "font-bold" : ""}>{opt.text} {isSelected && <Check className="inline h-3 w-3 text-green-500" />}</span>
                                {showResults && <span className="text-muted-foreground">{pct}% ({count})</span>}
                              </div>
                              {showResults && <Progress value={pct} className="h-1.5" />}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {hasVoted && !showResults && (
                    <p className="text-[10px] text-muted-foreground text-center">{t("Waiting for results...", "بانتظار النتائج...")}</p>
                  )}

                  <p className="text-[10px] text-muted-foreground">{totalVotes} {t("votes", "صوت")}</p>

                  {isPrivileged && poll.is_active && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={() => toggleResults(poll.id, poll.show_results)}>
                        {poll.show_results ? t("Hide Results", "إخفاء") : t("Show Results", "إظهار")}
                      </Button>
                      <Button size="sm" variant="destructive" className="h-6 text-[10px]" onClick={() => endPoll(poll.id)}>
                        {t("End", "إنهاء")}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {polls.length === 0 && !creating && (
            <p className="text-xs text-muted-foreground text-center py-8">
              {t("No polls yet", "لا توجد تصويتات بعد")}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ClassPolls;
