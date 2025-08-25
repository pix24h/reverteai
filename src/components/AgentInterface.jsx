import React, { useState, useEffect, useRef } from "react";
import { apiRequest, API_BASE_URL } from "../utils/supabaseClient";

const AgentInterface = ({ user }) => {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentRecipe, setCurrentRecipe] = useState(null);
  const [agentConfig, setAgentConfig] = useState(null);
  const [medications, setMedications] = useState([]);
  const [showRecipeExpanded, setShowRecipeExpanded] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioPlayerVisible, setAudioPlayerVisible] = useState(false); // Novo estado
  const [showDashboard, setShowDashboard] = useState(false);
  const [healthData, setHealthData] = useState([]);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [audioWaves, setAudioWaves] = useState([]);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);

  // Carregar dados iniciais
  useEffect(() => {
    loadInitialData();
    // Remover carregamento automático da última mensagem
  }, [user]);

  // Efeito para animação das ondas sonoras
  useEffect(() => {
    let interval;
    if (isPlayingAudio) {
      interval = setInterval(() => {
        setAudioWaves(Array.from({ length: 20 }, () => Math.random() * 100));
      }, 100);
    } else {
      setAudioWaves([]);
    }
    return () => clearInterval(interval);
  }, [isPlayingAudio]);

  const loadInitialData = async () => {
    try {
      // Carregar configurações do agente
      const profile = await apiRequest("/api/user/profile");
      setAgentConfig(profile.configuracoes_agente?.[0]);

      // Carregar medicamentos
      const meds = await apiRequest("/api/medicamentos");
      setMedications(meds);

      // Carregar dados de saúde recentes
      const healthResponse = await apiRequest("/api/dados-saude?limite=7");
      setHealthData(healthResponse.dados || healthResponse);
    } catch (error) {
      console.error("Erro ao carregar dados iniciais:", error);
    }
  };

  // Funções para cálculos de saúde
  const calcularIMC = (peso, altura) => {
    if (!peso || !altura) return null;
    return (peso / (altura * altura)).toFixed(1);
  };

  const classificarIMC = (imc) => {
    if (!imc) return { categoria: "N/A", cor: "gray" };
    const imcNum = parseFloat(imc);
    if (imcNum < 18.5) return { categoria: "Abaixo do peso", cor: "blue" };
    if (imcNum < 25) return { categoria: "Peso normal", cor: "green" };
    if (imcNum < 30) return { categoria: "Sobrepeso", cor: "yellow" };
    if (imcNum < 35) return { categoria: "Obesidade I", cor: "orange" };
    if (imcNum < 40) return { categoria: "Obesidade II", cor: "red" };
    return { categoria: "Obesidade III", cor: "red" };
  };

  const calcularPesoIdeal = (altura, sexo) => {
    if (!altura) return null;
    // Fórmula de Robinson
    if (sexo === "M") {
      return (52 + 1.9 * (altura * 100 - 152.4)).toFixed(1);
    } else {
      return (49 + 1.7 * (altura * 100 - 152.4)).toFixed(1);
    }
  };

  const classificarPressao = (sistolica, diastolica) => {
    if (!sistolica || !diastolica) return { categoria: "N/A", cor: "gray" };
    if (sistolica < 120 && diastolica < 80)
      return { categoria: "Normal", cor: "green" };
    if (sistolica < 130 && diastolica < 80)
      return { categoria: "Elevada", cor: "yellow" };
    if (sistolica < 140 || diastolica < 90)
      return { categoria: "Hipertensão I", cor: "orange" };
    if (sistolica < 180 || diastolica < 120)
      return { categoria: "Hipertensão II", cor: "red" };
    return { categoria: "Crise Hipertensiva", cor: "red" };
  };

  const classificarGlicemia = (glicemia, tipo = "jejum") => {
    if (!glicemia) return { categoria: "N/A", cor: "gray" };
    if (tipo === "jejum") {
      if (glicemia < 100) return { categoria: "Normal", cor: "green" };
      if (glicemia < 126) return { categoria: "Pré-diabetes", cor: "yellow" };
      return { categoria: "Diabetes", cor: "red" };
    } else {
      // pós-refeição
      if (glicemia < 140) return { categoria: "Normal", cor: "green" };
      if (glicemia < 200) return { categoria: "Pré-diabetes", cor: "yellow" };
      return { categoria: "Diabetes", cor: "red" };
    }
  };

  const calcularProgressoPeso = (pesoAtual, pesoInicial, pesoIdeal) => {
    if (!pesoAtual || !pesoInicial || !pesoIdeal) return null;
    const perdaTotal = pesoInicial - pesoIdeal;
    const perdaAtual = pesoInicial - pesoAtual;
    return Math.min((perdaAtual / perdaTotal) * 100, 100).toFixed(1);
  };

  const handleSendMessage = async () => {
    if (!message.trim() || isLoading) return;

    const userMessage = message.trim();
    setMessage("");
    setIsLoading(true);

    try {
      const response = await apiRequest("/api/conversa", {
        method: "POST",
        body: JSON.stringify({
          mensagem: userMessage,
          tipo_interacao: "conversa_geral",
        }),
      });

      // Verificar se alguma função foi executada
      if (
        response.funcoes_executadas &&
        response.funcoes_executadas.length > 0
      ) {
        response.funcoes_executadas.forEach((funcao) => {
          switch (funcao.function) {
            case "gerar_receita":
              if (funcao.result.success && funcao.result.receita) {
                setCurrentRecipe(funcao.result.receita);
                setShowDashboard(false);
              }
              break;
            case "registrar_dados_saude":
              if (funcao.result.success) {
                // Recarregar dados de saúde
                loadInitialData();
              }
              break;
            case "buscar_dados_saude":
              if (funcao.result.success) {
                setHealthData(funcao.result.dados);
                setShowDashboard(true);
                setCurrentRecipe(null);
              }
              break;
            case "buscar_medicamentos":
              if (funcao.result.success) {
                setMedications(funcao.result.medicamentos);
              }
              break;
            case "adicionar_medicamento":
              if (funcao.result.success) {
                // Recarregar medicamentos
                loadInitialData();
              }
              break;
          }
        });
      }

      // Se o backend retornou uma receita diretamente (compatibilidade)
      if (response.receita) {
        setCurrentRecipe(response.receita);
        setShowDashboard(false);
      }

      // Reproduzir resposta em áudio
      if (response.resposta) {
        await playTextAsAudio(response.resposta);
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      await playTextAsAudio("Desculpe, ocorreu um erro. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/wav",
        });
        await sendAudioMessage(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Erro ao iniciar gravação:", error);
      alert("Erro ao acessar o microfone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Remover toggleRecording - agora será pressionar e soltar
  const handleMouseDown = () => {
    if (!isLoading) {
      startRecording();
    }
  };

  const handleMouseUp = () => {
    if (isRecording) {
      stopRecording();
    }
  };

  const handleTouchStart = (e) => {
    e.preventDefault();
    if (!isLoading) {
      startRecording();
    }
  };

  const handleTouchEnd = (e) => {
    e.preventDefault();
    if (isRecording) {
      stopRecording();
    }
  };

  const sendAudioMessage = async (audioBlob) => {
    setIsLoading(true);

    try {
      // Criar FormData manualmente para o endpoint de conversa com áudio
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.wav");
      formData.append("tipo_interacao", "conversa_geral");

      const response = await fetch(`${API_BASE_URL}/api/conversa`, {
        method: "POST",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro na requisição");
      }

      const result = await response.json();

      // Verificar se alguma função foi executada
      if (result.funcoes_executadas && result.funcoes_executadas.length > 0) {
        result.funcoes_executadas.forEach((funcao) => {
          switch (funcao.function) {
            case "gerar_receita":
              if (funcao.result.success && funcao.result.receita) {
                setCurrentRecipe(funcao.result.receita);
                setShowDashboard(false);
              }
              break;
            case "registrar_dados_saude":
              if (funcao.result.success) {
                loadInitialData();
              }
              break;
            case "buscar_dados_saude":
              if (funcao.result.success) {
                setHealthData(funcao.result.dados);
                setShowDashboard(true);
                setCurrentRecipe(null);
              }
              break;
            case "buscar_medicamentos":
              if (funcao.result.success) {
                setMedications(funcao.result.medicamentos);
              }
              break;
            case "adicionar_medicamento":
              if (funcao.result.success) {
                loadInitialData();
              }
              break;
          }
        });
      }

      // Se foi áudio, reproduzir resposta em áudio automaticamente
      if (result.resposta) {
        await playTextAsAudio(result.resposta);
      }
    } catch (error) {
      console.error("Erro ao enviar áudio:", error);
      await playTextAsAudio(
        "Desculpe, não consegui processar o áudio. Tente novamente."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validar arquivo antes do upload
    const tiposPermitidos = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];
    if (!tiposPermitidos.includes(file.type)) {
      await playTextAsAudio(
        "Tipo de arquivo não suportado. Use JPEG, PNG ou WebP."
      );
      return;
    }

    // Validar tamanho (10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      await playTextAsAudio("Arquivo muito grande. O tamanho máximo é 10MB.");
      return;
    }

    setIsLoading(true);

    try {
      console.log(
        "📸 Iniciando upload de imagem:",
        file.name,
        file.type,
        file.size
      );

      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Token não encontrado. Faça login novamente.");
      }

      // Preparar FormData
      const formData = new FormData();
      formData.append("image", file);
      formData.append(
        "mensagem",
        "Analise esta imagem dos meus ingredientes e me sugira uma receita saudável para diabéticos"
      );
      formData.append("tipo_interacao", "receita");

      console.log("📤 Enviando requisição para API...");

      const response = await fetch(`${API_BASE_URL}/api/conversa`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          // NÃO definir Content-Type - deixar o browser definir automaticamente para FormData
        },
        body: formData,
      });

      console.log("📡 Status da resposta:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("❌ Erro na API:", errorData);
        throw new Error(
          errorData.message || errorData.error || "Erro na requisição"
        );
      }

      const result = await response.json();
      console.log("✅ Resposta da API:", result);

      // Verificar se alguma função foi executada (geração de receita)
      if (result.funcoes_executadas && result.funcoes_executadas.length > 0) {
        result.funcoes_executadas.forEach((funcao) => {
          console.log("⚙️ Função executada:", funcao.function);

          if (
            funcao.function === "gerar_receita" &&
            funcao.result.success &&
            funcao.result.receita
          ) {
            console.log("🍽️ Receita gerada:", funcao.result.receita.nome);
            setCurrentRecipe(funcao.result.receita);
            setShowDashboard(false);
          }
        });
      }

      // Reproduzir resposta em áudio
      if (result.resposta) {
        console.log("🔊 Reproduzindo resposta em áudio");
        await playTextAsAudio(result.resposta);
      }
    } catch (error) {
      console.error("❌ Erro ao processar imagem:", error);

      // Tratar diferentes tipos de erro
      let mensagemErro;
      if (error.message.includes("Token")) {
        mensagemErro = "Sessão expirada. Faça login novamente.";
      } else if (
        error.message.includes("rede") ||
        error.message.includes("fetch")
      ) {
        mensagemErro =
          "Erro de conexão. Verifique sua internet e tente novamente.";
      } else {
        mensagemErro =
          "Desculpe, não consegui processar a imagem. Tente novamente.";
      }

      await playTextAsAudio(mensagemErro);
    } finally {
      setIsLoading(false);

      // Limpar o input file para permitir reenvio do mesmo arquivo
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  const generateNewRecipe = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest("/api/conversa", {
        method: "POST",
        body: JSON.stringify({
          mensagem: "Gere uma nova receita para mim",
          tipo_interacao: "conversa_geral",
        }),
      });

      // Verificar se alguma função foi executada
      if (
        response.funcoes_executadas &&
        response.funcoes_executadas.length > 0
      ) {
        response.funcoes_executadas.forEach((funcao) => {
          if (
            funcao.function === "gerar_receita" &&
            funcao.result.success &&
            funcao.result.receita
          ) {
            setCurrentRecipe(funcao.result.receita);
            setShowDashboard(false);
          }
        });
      }

      // Reproduzir resposta em áudio
      if (response.resposta) {
        await playTextAsAudio(response.resposta);
      }
    } catch (error) {
      console.error("Erro ao gerar receita:", error);
      await playTextAsAudio("Desculpe, ocorreu um erro ao gerar nova receita.");
    } finally {
      setIsLoading(false);
    }
  };

  // Função para reproduzir texto como áudio usando OpenAI TTS
  const playTextAsAudio = async (text) => {
    if (!text) return;
    if (currentAudio) {
      currentAudio.pause();
      URL.revokeObjectURL(currentAudio.src);
    }

    try {
      setAudioPlayerVisible(true); // Mostra o player
      setIsPlayingAudio(false); // Garante que as ondas não comecem antes

      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/text-to-speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          texto: text,
          voz: "nova", // Voz feminina natural da OpenAI
        }),
      });

      if (!response.ok) {
        throw new Error("Erro ao gerar áudio");
      }

      const audioBuffer = await response.arrayBuffer();
      const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setCurrentAudio(audio);

      audio.oncanplaythrough = async () => {
        try {
          await audio.play();
          setIsPlayingAudio(true); // Começa a animação de ondas
        } catch (playError) {
          console.error("Erro ao iniciar a reprodução:", playError);
          setIsPlayingAudio(false);
          setAudioPlayerVisible(false);
        }
      };

      audio.onended = () => {
        setIsPlayingAudio(false);
        setCurrentAudio(null);
        setAudioPlayerVisible(false); // Esconde o player ao terminar
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setIsPlayingAudio(false);
        setCurrentAudio(null);
        setAudioPlayerVisible(false);
        URL.revokeObjectURL(audioUrl);
        console.error("Erro ao reproduzir áudio");
      };

      audio.load();
    } catch (error) {
      console.error("Erro ao gerar/reproduzir áudio:", error);
      setIsPlayingAudio(false);
      setCurrentAudio(null);
      setAudioPlayerVisible(false);

      // Fallback para voz do navegador em caso de erro
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "pt-BR";
        utterance.rate = 0.9;
        utterance.pitch = 1.1;

        utterance.onend = () => {
          setIsPlayingAudio(false);
          setAudioPlayerVisible(false);
        };

        utterance.onerror = () => {
          setIsPlayingAudio(false);
          setAudioPlayerVisible(false);
        };

        speechSynthesis.speak(utterance);
      } catch (fallbackError) {
        console.error("Erro no fallback de áudio:", fallbackError);
        setIsPlayingAudio(false);
        setAudioPlayerVisible(false);
      }
    }
  };

  // Função para pausar/retomar áudio
  const toggleAudioPlayback = () => {
    if (currentAudio) {
      if (currentAudio.paused) {
        currentAudio.play();
        setIsPlayingAudio(true);
      } else {
        currentAudio.pause();
        setIsPlayingAudio(false);
      }
    }
  };

  // Função para ouvir novamente
  const replayAudio = async () => {
    if (currentAudio) {
      currentAudio.currentTime = 0;
      await currentAudio.play();
      setIsPlayingAudio(true);
    }
  };

  // Função para lidar com "Refeição concluída!"
  const handleAlreadyAte = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest("/api/conversa", {
        method: "POST",
        body: JSON.stringify({
          mensagem: "Refeição concluída!",
          tipo_interacao: "conversa_geral",
        }),
      });

      setCurrentRecipe(null); // Ocultar receita
      setShowRecipeExpanded(false); // Garantir que receita expandida seja fechada
      setShowDashboard(true); // Mostrar dashboard

      // Carregar dados de saúde para o dashboard
      const healthResponse = await apiRequest("/api/dados-saude?limite=7");
      setHealthData(healthResponse);

      // Reproduzir resposta em áudio
      if (response.resposta) {
        await playTextAsAudio(response.resposta);
      }
    } catch (error) {
      console.error('Erro ao processar "Refeição concluída!":', error);
      await playTextAsAudio("Desculpe, ocorreu um erro. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // Função para extrair ingredientes base
  const getMinimizedIngredients = (ingredientes) => {
    return ingredientes
      .map((ing) => {
        // Remover quantidades e medidas, manter apenas o ingrediente base
        return ing
          .replace(
            /^\d+\s*(colher|xícara|ml|g|kg|unidade|dente|pitada|a gosto)?\s*(de\s*)?/i,
            ""
          )
          .replace(/\s*\(.*?\)/g, "") // Remove parênteses
          .trim()
          .split(",")[0] // Pega apenas a primeira parte se houver vírgula
          .split(" ou ")[0] // Pega apenas a primeira opção
          .trim();
      })
      .filter((ing) => ing.length > 0);
  };

  return (
    <div className="h-screen bg-gradient-to-b from-teal-400 to-teal-600 flex flex-col relative">
      {/* Animação de Carregamento */}
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center z-50">
          <div className="w-16 h-16 border-4 border-t-transparent border-white rounded-full animate-spin"></div>
          <p className="text-white text-lg mt-4">Processando...</p>
        </div>
      )}

      <div className="flex-grow overflow-y-auto p-4">
        <div className="max-w-lg mx-auto">
          {/* Agent Avatar */}
          <div className="text-center">
            <div className="bg-white rounded-full px-8 py-4 inline-block shadow-lg mb-6">
              <h2 className="text-3xl font-bold text-teal-600">
                {agentConfig?.nome_agente || "Ana"}
              </h2>
            </div>
          </div>

          {/* Audio Player Area - Nova área para reprodução de áudio */}
          {audioPlayerVisible && (
            <div className="bg-white rounded-2xl p-6 mb-4 shadow-lg">
              <div className="text-center">
                {/* Animação de ondas sonoras */}
                <div className="flex justify-center items-end gap-1 mb-4 h-16">
                  {audioWaves.map((height, index) => (
                    <div
                      key={index}
                      className="bg-teal-500 rounded-full transition-all duration-100 ease-in-out"
                      style={{
                        width: "4px",
                        height: `${Math.max(height * 0.6, 10)}%`,
                        opacity: 0.7 + (height / 100) * 0.3,
                      }}
                    />
                  ))}
                </div>

                {/* Controles de áudio */}
                <div className="flex justify-center gap-4">
                  <button
                    onClick={toggleAudioPlayback}
                    className="bg-teal-500 text-white p-3 rounded-full hover:bg-teal-600 transition-colors"
                  >
                    {currentAudio?.paused ? (
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m-6-8h8a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2z"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    )}
                  </button>

                  <button
                    onClick={replayAudio}
                    className="bg-gray-500 text-white p-3 rounded-full hover:bg-gray-600 transition-colors"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Recipe Card */}
          {currentRecipe && (
            <div className="bg-white rounded-2xl p-6 mb-4 shadow-lg">
              <div className="mb-6">
                {currentRecipe.imagem_url && (
                  <img
                    src={currentRecipe.imagem_url}
                    alt={currentRecipe.nome_receita}
                    className="w-full h-40 object-cover rounded-lg mb-4"
                  />
                )}
                <h3 className="text-2xl font-bold text-gray-800 text-center">
                  {currentRecipe.nome_receita} 🥞
                </h3>
              </div>

              {/* Ingredientes Minimizados */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-600 mb-3">
                  Ingredientes necessários:
                </h4>
                <div className="flex flex-wrap gap-2">
                  {getMinimizedIngredients(currentRecipe.ingredientes).map(
                    (ing, i) => (
                      <span
                        key={i}
                        className="bg-teal-100 text-teal-800 px-3 py-2 rounded-full text-sm font-medium"
                      >
                        {ing}
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Nutritional Info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-2 gap-3 text-base">
                  <div>⏱️ {currentRecipe.tempo_preparo} min</div>
                  <div>🍽️ {currentRecipe.porcoes} porções</div>
                  <div>🔥 {currentRecipe.calorias_por_porcao} kcal</div>
                  <div>📊 IG {currentRecipe.indice_glicemico}</div>
                </div>
              </div>

              {/* Receita Expandida */}
              {showRecipeExpanded && (
                <div className="border-t pt-6 mb-6">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-bold mb-3 text-lg">
                        Ingredientes Completos:
                      </h4>
                      <ul className="list-disc list-inside space-y-2 text-base">
                        {currentRecipe.ingredientes.map((ing, i) => (
                          <li key={i}>{ing}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-bold mb-3 text-lg">
                        Modo de Preparo:
                      </h4>
                      <p className="whitespace-pre-line text-base leading-relaxed">
                        {currentRecipe.modo_preparo}
                      </p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-bold mb-3 text-lg">
                        Informações Nutricionais:
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-base">
                        <div>
                          Calorias: {currentRecipe.calorias_por_porcao} kcal
                        </div>
                        <div>
                          Carboidratos: {currentRecipe.carboidratos_por_porcao}g
                        </div>
                        <div>
                          Proteínas: {currentRecipe.proteinas_por_porcao}g
                        </div>
                        <div>IG: {currentRecipe.indice_glicemico}</div>
                      </div>
                    </div>

                    {/* Botão Narrar Receita */}
                    <button
                      onClick={() =>
                        playTextAsAudio(
                          `${
                            currentRecipe.nome_receita
                          }. Ingredientes: ${currentRecipe.ingredientes.join(
                            ", "
                          )}. Modo de preparo: ${currentRecipe.modo_preparo}`
                        )
                      }
                      disabled={isPlayingAudio}
                      className="w-full bg-purple-500 text-white py-3 px-6 rounded-lg hover:bg-purple-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-lg font-medium"
                    >
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M9 12a3 3 0 106 0v-6a3 3 0 00-6 0v6z"
                        />
                      </svg>
                      {isPlayingAudio ? "Narrando..." : "Narrar Receita"}
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-4">
                <div className="flex gap-4">
                  <button
                    onClick={() => setShowRecipeExpanded(!showRecipeExpanded)}
                    className="bg-teal-500 text-white px-8 py-4 rounded-lg hover:bg-teal-600 transition-colors flex items-center gap-2 flex-1 justify-center text-xl font-medium"
                  >
                    <svg
                      className="w-7 h-7"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={
                          showRecipeExpanded
                            ? "M5 15l7-7 7 7"
                            : "M19 9l-7 7-7-7"
                        }
                      />
                    </svg>
                    {showRecipeExpanded ? "Ocultar" : "Ver receita"}
                  </button>
                  <button
                    onClick={generateNewRecipe}
                    disabled={isLoading}
                    className="bg-white border-2 border-teal-500 text-teal-500 px-4 py-4 rounded-lg hover:bg-teal-50 transition-colors flex items-center gap-2 flex-1 justify-center text-xl font-medium disabled:opacity-50"
                  >
                    <svg
                      className="w-7 h-7"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Gerar outra
                  </button>
                </div>

                {/* Botão Refeição concluída! */}
                <button
                  onClick={handleAlreadyAte}
                  disabled={isLoading}
                  className="w-full bg-green-500 text-white py-5 px-8 rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-3 text-xl font-medium disabled:opacity-50"
                >
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Refeição concluída!
                </button>
              </div>
            </div>
          )}

          {/* Dashboard de Progresso - Versão Compacta */}
          {showDashboard && (
            <div className="bg-white rounded-2xl p-6 mb-4 shadow-lg">
              <h3 className="text-2xl font-bold text-gray-800 text-center mb-6">
                Dashboard de Progresso
              </h3>

              {/* Gráfico de Avaliação Visual */}
              {healthData &&
                healthData.saude &&
                healthData.saude.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-lg font-bold text-gray-700 mb-4 text-center">
                      Evolução dos Últimos 7 Dias
                    </h4>
                    <div className="bg-gradient-to-r from-blue-50 to-green-50 p-4 rounded-lg">
                      {/* Gráfico de Peso */}
                      {healthData.saude.some((d) => d.peso) && (
                        <div className="mb-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-600">
                              Peso (kg)
                            </span>
                            <span className="text-sm text-blue-600 font-bold">
                              {healthData.saude.find((d) => d.peso)?.peso}kg
                            </span>
                          </div>
                          <div className="flex gap-1 h-8">
                            {healthData.saude
                              .slice(0, 7)
                              .reverse()
                              .map((data, index) => {
                                const peso = data.peso;
                                const maxPeso = Math.max(
                                  ...healthData.saude
                                    .filter((d) => d.peso)
                                    .map((d) => d.peso)
                                );
                                const minPeso = Math.min(
                                  ...healthData.saude
                                    .filter((d) => d.peso)
                                    .map((d) => d.peso)
                                );
                                const altura = peso
                                  ? ((peso - minPeso) /
                                      (maxPeso - minPeso || 1)) *
                                    100
                                  : 0;
                                return (
                                  <div
                                    key={index}
                                    className="flex-1 flex items-end"
                                  >
                                    <div
                                      className={`w-full rounded-t transition-all duration-300 ${
                                        peso ? "bg-blue-400" : "bg-gray-200"
                                      }`}
                                      style={{
                                        height: `${Math.max(altura, 15)}%`,
                                      }}
                                      title={
                                        peso
                                          ? `${peso}kg - ${new Date(
                                              data.data_medicao
                                            ).toLocaleDateString("pt-BR")}`
                                          : "Sem dados"
                                      }
                                    />
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Gráfico de Glicemia */}
                      {healthData.saude.some((d) => d.glicemia_jejum) && (
                        <div className="mb-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-600">
                              Glicemia (mg/dL)
                            </span>
                            <span className="text-sm text-red-600 font-bold">
                              {
                                healthData.saude.find((d) => d.glicemia_jejum)
                                  ?.glicemia_jejum
                              }
                              mg/dL
                            </span>
                          </div>
                          <div className="flex gap-1 h-8">
                            {healthData.saude
                              .slice(0, 7)
                              .reverse()
                              .map((data, index) => {
                                const glicemia = data.glicemia_jejum;
                                const altura = glicemia
                                  ? Math.min((glicemia / 140) * 100, 100)
                                  : 0;
                                const cor =
                                  glicemia > 100
                                    ? "bg-red-400"
                                    : glicemia > 95
                                    ? "bg-yellow-400"
                                    : "bg-green-400";
                                return (
                                  <div
                                    key={index}
                                    className="flex-1 flex items-end"
                                  >
                                    <div
                                      className={`w-full rounded-t transition-all duration-300 ${
                                        glicemia ? cor : "bg-gray-200"
                                      }`}
                                      style={{
                                        height: `${Math.max(altura, 15)}%`,
                                      }}
                                      title={
                                        glicemia
                                          ? `${glicemia}mg/dL - ${new Date(
                                              data.data_medicao
                                            ).toLocaleDateString("pt-BR")}`
                                          : "Sem dados"
                                      }
                                    />
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Indicadores de Bem-estar */}
                      {healthData.bem_estar &&
                        healthData.bem_estar.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-gray-600 mb-3 text-center">
                              Estado Atual
                            </div>
                            <div className="flex justify-center gap-6">
                              {healthData.bem_estar[0].nivel_estresse !==
                                null && (
                                <div className="text-center">
                                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gray-200 rounded-full"></div>
                                    <div
                                      className={`absolute bottom-0 left-0 right-0 transition-all duration-500 ${
                                        healthData.bem_estar[0].nivel_estresse >
                                        7
                                          ? "bg-red-400"
                                          : healthData.bem_estar[0]
                                              .nivel_estresse > 4
                                          ? "bg-yellow-400"
                                          : "bg-green-400"
                                      }`}
                                      style={{
                                        height: `${
                                          (healthData.bem_estar[0]
                                            .nivel_estresse /
                                            10) *
                                          100
                                        }%`,
                                      }}
                                    ></div>
                                    <span className="relative z-10 text-gray-700">
                                      {healthData.bem_estar[0].nivel_estresse}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-600 mt-2">
                                    Estresse
                                  </div>
                                </div>
                              )}

                              {healthData.bem_estar[0].nivel_energia !==
                                null && (
                                <div className="text-center">
                                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gray-200 rounded-full"></div>
                                    <div
                                      className={`absolute bottom-0 left-0 right-0 transition-all duration-500 ${
                                        healthData.bem_estar[0].nivel_energia >
                                        7
                                          ? "bg-green-400"
                                          : healthData.bem_estar[0]
                                              .nivel_energia > 4
                                          ? "bg-yellow-400"
                                          : "bg-red-400"
                                      }`}
                                      style={{
                                        height: `${
                                          (healthData.bem_estar[0]
                                            .nivel_energia /
                                            10) *
                                          100
                                        }%`,
                                      }}
                                    ></div>
                                    <span className="relative z-10 text-gray-700">
                                      {healthData.bem_estar[0].nivel_energia}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-600 mt-2">
                                    Energia
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                )}

              {/* Métricas de Saúde */}
              {healthData &&
                healthData.saude &&
                healthData.saude.length > 0 &&
                user && (
                  <div className="mb-6">
                    <h4 className="text-lg font-bold text-gray-700 mb-4 text-center">
                      Análise de Saúde
                    </h4>
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg space-y-4">
                      {(() => {
                        const dadoAtual = healthData.saude[0];
                        const imc = calcularIMC(dadoAtual.peso, user.altura);
                        const imcClass = classificarIMC(imc);
                        const pesoIdeal = calcularPesoIdeal(
                          user.altura,
                          user.sexo
                        );
                        const progressoPeso = calcularProgressoPeso(
                          dadoAtual.peso,
                          user.peso_inicial,
                          pesoIdeal
                        );
                        const pressaoClass = classificarPressao(
                          dadoAtual.pressao_sistolica,
                          dadoAtual.pressao_diastolica
                        );
                        const glicemiaClass = classificarGlicemia(
                          dadoAtual.glicemia_jejum
                        );

                        return (
                          <>
                            {/* IMC e Peso */}
                            {imc && (
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white p-3 rounded text-center">
                                  <div className="text-xl font-bold text-purple-600">
                                    {imc}
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    IMC
                                  </div>
                                  <div
                                    className={`text-sm font-medium ${
                                      imcClass.cor === "green"
                                        ? "text-green-600"
                                        : imcClass.cor === "yellow"
                                        ? "text-yellow-600"
                                        : imcClass.cor === "orange"
                                        ? "text-orange-600"
                                        : imcClass.cor === "red"
                                        ? "text-red-600"
                                        : "text-blue-600"
                                    }`}
                                  >
                                    {imcClass.categoria}
                                  </div>
                                </div>

                                {pesoIdeal && (
                                  <div className="bg-white p-3 rounded text-center">
                                    <div className="text-xl font-bold text-pink-600">
                                      {pesoIdeal}kg
                                    </div>
                                    <div className="text-sm text-gray-600">
                                      Peso Ideal
                                    </div>
                                    {progressoPeso && (
                                      <div className="text-sm font-medium text-pink-600">
                                        {progressoPeso > 0
                                          ? `${progressoPeso}% alcançado`
                                          : "Iniciando jornada"}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Pressão Arterial */}
                            {dadoAtual.pressao_sistolica &&
                              dadoAtual.pressao_diastolica && (
                                <div className="bg-white p-3 rounded">
                                  <div className="flex justify-between items-center">
                                    <div>
                                      <div className="text-base font-bold text-gray-700">
                                        Pressão Arterial
                                      </div>
                                      <div className="text-xl font-bold text-red-600">
                                        {dadoAtual.pressao_sistolica}/
                                        {dadoAtual.pressao_diastolica} mmHg
                                      </div>
                                    </div>
                                    <div
                                      className={`px-3 py-2 rounded text-sm font-medium ${
                                        pressaoClass.cor === "green"
                                          ? "bg-green-100 text-green-800"
                                          : pressaoClass.cor === "yellow"
                                          ? "bg-yellow-100 text-yellow-800"
                                          : pressaoClass.cor === "orange"
                                          ? "bg-orange-100 text-orange-800"
                                          : "bg-red-100 text-red-800"
                                      }`}
                                    >
                                      {pressaoClass.categoria}
                                    </div>
                                  </div>
                                </div>
                              )}

                            {/* Glicemia */}
                            {dadoAtual.glicemia_jejum && (
                              <div className="bg-white p-3 rounded">
                                <div className="flex justify-between items-center">
                                  <div>
                                    <div className="text-base font-bold text-gray-700">
                                      Glicemia em Jejum
                                    </div>
                                    <div className="text-xl font-bold text-blue-600">
                                      {dadoAtual.glicemia_jejum} mg/dL
                                    </div>
                                  </div>
                                  <div
                                    className={`px-3 py-2 rounded text-sm font-medium ${
                                      glicemiaClass.cor === "green"
                                        ? "bg-green-100 text-green-800"
                                        : glicemiaClass.cor === "yellow"
                                        ? "bg-yellow-100 text-yellow-800"
                                        : "bg-red-100 text-red-800"
                                    }`}
                                  >
                                    {glicemiaClass.categoria}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Progresso Visual */}
                            {progressoPeso && progressoPeso > 0 && (
                              <div className="bg-white p-3 rounded">
                                <div className="text-base font-bold text-gray-700 mb-2">
                                  Progresso do Peso
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-3">
                                  <div
                                    className="bg-gradient-to-r from-pink-400 to-purple-500 h-3 rounded-full transition-all duration-500"
                                    style={{
                                      width: `${Math.min(progressoPeso, 100)}%`,
                                    }}
                                  ></div>
                                </div>
                                <div className="text-sm text-gray-600 mt-2">
                                  {dadoAtual.peso}kg → {pesoIdeal}kg (
                                  {progressoPeso}% concluído)
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

              {/* Resumo Compacto */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {healthData?.saude?.length || 0}
                  </div>
                  <div className="text-base text-blue-800">
                    Registros de Saúde
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {medications?.length || 0}
                  </div>
                  <div className="text-base text-green-800">Medicamentos</div>
                </div>
              </div>

              {/* Dados Recentes Compactos */}
              <div className="mb-6">
                <h4 className="text-xl font-bold text-gray-800 mb-3">
                  Últimos Registros
                </h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  {healthData &&
                  healthData.saude &&
                  healthData.saude.length > 0 ? (
                    <div className="space-y-3">
                      {healthData.saude.slice(0, 3).map((data, index) => (
                        <div
                          key={index}
                          className="flex justify-between items-center text-base"
                        >
                          <span className="text-gray-600">
                            {new Date(data.data_medicao).toLocaleDateString(
                              "pt-BR"
                            )}
                          </span>
                          <div className="flex gap-3">
                            {data.peso && (
                              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded text-sm">
                                {data.peso}kg
                              </span>
                            )}
                            {data.pressao_sistolica &&
                              data.pressao_diastolica && (
                                <span className="bg-red-100 text-red-800 px-3 py-1 rounded text-sm">
                                  {data.pressao_sistolica}/
                                  {data.pressao_diastolica}
                                </span>
                              )}
                            {data.glicemia_jejum && (
                              <span
                                className={`px-3 py-1 rounded text-sm ${
                                  data.glicemia_jejum > 100
                                    ? "bg-red-100 text-red-800"
                                    : data.glicemia_jejum > 95
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-green-100 text-green-800"
                                }`}
                              >
                                {data.glicemia_jejum}mg/dL
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500">
                      <p className="text-base">Nenhum dado registrado</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Bem-estar Recente */}
              {healthData &&
                healthData.bem_estar &&
                healthData.bem_estar.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-xl font-bold text-gray-800 mb-3">
                      Estado Atual
                    </h4>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      {healthData.bem_estar
                        .slice(0, 1)
                        .map((bem_estar, index) => (
                          <div key={index} className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {bem_estar.estado_emocional && (
                                <span className="bg-purple-100 text-purple-800 px-3 py-2 rounded text-sm">
                                  😊 {bem_estar.estado_emocional}
                                </span>
                              )}
                              {bem_estar.nivel_estresse !== null && (
                                <span
                                  className={`px-3 py-2 rounded text-sm ${
                                    bem_estar.nivel_estresse > 7
                                      ? "bg-red-100 text-red-800"
                                      : bem_estar.nivel_estresse > 4
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-green-100 text-green-800"
                                  }`}
                                >
                                  Estresse: {bem_estar.nivel_estresse}/10
                                </span>
                              )}
                              {bem_estar.qualidade_humor && (
                                <span className="bg-yellow-100 text-yellow-800 px-3 py-2 rounded text-sm">
                                  Humor: {bem_estar.qualidade_humor}
                                </span>
                              )}
                              {bem_estar.nivel_energia !== null && (
                                <span
                                  className={`px-3 py-2 rounded text-sm ${
                                    bem_estar.nivel_energia > 7
                                      ? "bg-green-100 text-green-800"
                                      : bem_estar.nivel_energia > 4
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  Energia: {bem_estar.nivel_energia}/10
                                </span>
                              )}
                            </div>

                            {/* Sintomas Físicos */}
                            {bem_estar.sintomas_fisicos &&
                              bem_estar.sintomas_fisicos.length > 0 && (
                                <div>
                                  <div className="text-sm font-medium text-gray-600 mb-2">
                                    Sintomas:
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {bem_estar.sintomas_fisicos.map(
                                      (sintoma, sintomaIndex) => (
                                        <span
                                          key={sintomaIndex}
                                          className="bg-orange-100 text-orange-800 px-3 py-2 rounded text-sm"
                                        >
                                          ⚠️ {sintoma}
                                        </span>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}

                            {/* Observações */}
                            {bem_estar.observacoes && (
                              <div className="text-sm text-gray-600 italic">
                                {bem_estar.observacoes}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

              {/* Botão para voltar */}
              <button
                onClick={async () => {
                  setShowDashboard(false);
                  setCurrentRecipe(null);
                }}
                className="w-full bg-teal-500 text-white py-4 px-6 rounded-lg hover:bg-teal-600 transition-colors text-xl font-medium"
              >
                Voltar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Input Area - Fixo na parte inferior */}
      <div className="p-4 bg-gradient-to-b from-teal-400 to-teal-600">
        <div className="max-w-lg mx-auto">
          <div className="relative">
            <div className="bg-white rounded-3xl p-4 flex items-center gap-4 shadow-lg">
              {/* Camera Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="w-16 h-16 rounded-full flex items-center justify-center transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
              >
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageUpload}
                className="hidden"
              />

              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Digite sua mensagem..."
                className="flex-1 outline-none bg-transparent text-2xl text-gray-700 placeholder-gray-400 py-4"
                disabled={isLoading}
              />
            </div>

            {/* Microphone Button - Pressionar e Soltar */}
            <button
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              disabled={isLoading}
              className={`absolute bottom-full right-4 mb-2 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                isRecording
                  ? "bg-red-500 text-white scale-110"
                  : "bg-white text-teal-500 hover:bg-gray-100"
              } disabled:opacity-50`}
            >
              <svg
                className="w-10 h-10"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentInterface;
