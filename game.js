class HumanSpyGame {
    constructor() {
        this.apiKey = '';
        this.playerName = '';
        this.selectedModels = new Map(); // modelId -> {displayName: string, count: number}
        this.currentTurn = 0;
        this.score = 0;
        this.players = [];
        this.currentTopic = '';
        this.turnOrder = [];
        this.currentSpeakerIndex = 0;
        this.gamePhase = 'setup'; // setup, discussion, voting, gameOver
        this.votes = {};
        this.gameRunning = false;
        
        this.modelDisplayNames = {
            // Anthropic models
            'anthropic/claude-opus-4': 'Claude Opus 4',
            'anthropic/claude-sonnet-4': 'Claude Sonnet 4',
            'anthropic/claude-3.7-sonnet': 'Claude Sonnet 3.7',
            'anthropic/claude-3.5-haiku': 'Claude Haiku 3.5',
            'anthropic/claude-3.5-sonnet': 'Claude Sonnet 3.5 v2',
            'anthropic/claude-3.5-sonnet': 'Claude Sonnet 3.5',
            'anthropic/claude-3-opus': 'Claude Opus 3',
            'anthropic/claude-3-sonnet': 'Claude Sonnet 3',
            'anthropic/claude-3-haiku': 'Claude Haiku 3',
            // Meta models
            'meta-llama/llama-3.1-8b-instruct': 'Llama 3.1 8B Instruct',
            'meta-llama/llama-3.3-70b-instruct': 'Llama 3.3 70B Instruct',
            // Google models
            'google/gemma-3-27b-it': 'Gemma 3 27B IT',
            'google/gemma-3-4b-it': 'Gemma 3 4B IT',
            'google/gemma-3-12b-it': 'Gemma 3 12B IT',
            'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
            'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
            // OpenAI models
            'openai/gpt-4o': 'GPT-4o',
            'openai/gpt-4o-mini': 'GPT-4o Mini',
        };
        
        this.initializeEventListeners();
        this.setDefaultModels();
    }

    initializeEventListeners() {
        document.getElementById('start-game').addEventListener('click', () => this.startGame());
        document.getElementById('add-model').addEventListener('click', () => this.addModel());
        document.getElementById('send-message').addEventListener('click', () => this.sendPlayerMessage());
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendPlayerMessage();
            }
        });
        document.getElementById('submit-vote').addEventListener('click', () => this.submitVote());
        document.getElementById('continue-game').addEventListener('click', () => this.continueToNextTurn());
        document.getElementById('play-again').addEventListener('click', () => this.resetGame());
    }

    setDefaultModels() {
        // Set default selection: 1x Sonnet 4, 1x Sonnet 3.7, 1x Haiku 3.5
        // this.selectedModels.set('anthropic/claude-sonnet-4', {
        //     displayName: 'Claude Sonnet 4',
        //     count: 1
        // });
        // this.selectedModels.set('anthropic/claude-3.7-sonnet', {
        //     displayName: 'Claude Sonnet 3.7',
        //     count: 1
        // });
        // this.selectedModels.set('anthropic/claude-3.5-haiku', {
        //     displayName: 'Claude Haiku 3.5',
        //     count: 1
        // });
        // this.updateSelectedModelsDisplay();
    }

    addModel() {
        const modelSelect = document.getElementById('model-select');
        const instanceCount = parseInt(document.getElementById('instance-count').value);
        
        if (!modelSelect.value) {
            alert('Please select a model');
            return;
        }

        const modelId = modelSelect.value;
        const displayName = this.modelDisplayNames[modelId];
        
        if (this.selectedModels.has(modelId)) {
            // Update existing model count
            const existing = this.selectedModels.get(modelId);
            this.selectedModels.set(modelId, {
                displayName: displayName,
                count: existing.count + instanceCount
            });
        } else {
            // Add new model
            this.selectedModels.set(modelId, {
                displayName: displayName,
                count: instanceCount
            });
        }
        
        // Reset form
        modelSelect.value = '';
        document.getElementById('instance-count').value = '1';
        
        this.updateSelectedModelsDisplay();
    }

    removeModel(modelId) {
        this.selectedModels.delete(modelId);
        this.updateSelectedModelsDisplay();
    }

    updateSelectedModelsDisplay() {
        const container = document.getElementById('selected-models');
        
        if (this.selectedModels.size === 0) {
            container.innerHTML = '<div class="empty-models">No models selected</div>';
            return;
        }
        
        let html = '';
        for (const [modelId, modelInfo] of this.selectedModels.entries()) {
            html += `
                <div class="selected-model-item">
                    <div class="model-info">
                        <div class="model-name">${modelInfo.displayName}</div>
                        <div class="model-id">${modelId}</div>
                    </div>
                    <span class="instance-count">${modelInfo.count} instance${modelInfo.count !== 1 ? 's' : ''}</span>
                    <button class="remove-model" onclick="game.removeModel('${modelId}')">Remove</button>
                </div>
            `;
        }
        
        container.innerHTML = html;
    }

    async startGame() {
        this.apiKey = document.getElementById('api-key').value.trim();

        if (!this.apiKey) {
            alert('Please enter your API key');
            return;
        }

        if (this.selectedModels.size === 0) {
            alert('Please select at least one model');
            return;
        }

        this.gameRunning = true;
        this.showScreen('game-screen');
        await this.initializeGame();
    }

    async initializeGame() {
        // Calculate total number of bots
        let totalBots = 0;
        for (const [, modelInfo] of this.selectedModels.entries()) {
            totalBots += modelInfo.count;
        }
        
        // Create all bot names first
        const allBotNames = [];
        for (let i = 1; i <= totalBots + 1; i++) {
            allBotNames.push(`Bot${i}`);
        }
        
        // Randomly assign one bot name to the human player
        const humanBotIndex = Math.floor(Math.random() * allBotNames.length);
        this.playerName = allBotNames[humanBotIndex];
        
        // Remove the human's bot name from available names
        const availableBotNames = allBotNames.filter((_, index) => index !== humanBotIndex);
        
        // Initialize players array with human player
        this.players = [{ name: this.playerName, type: 'human' }];
        
        // Add AI bots based on selected models
        let botIndex = 0;
        for (const [modelId, modelInfo] of this.selectedModels.entries()) {
            for (let i = 0; i < modelInfo.count; i++) {
                this.players.push({
                    name: availableBotNames[botIndex],
                    type: 'bot',
                    model: modelId,
                    displayName: modelInfo.displayName
                });
                botIndex++;
            }
        }

        await this.generateTopic();
        this.startTurn();
    }

    async generateTopic() {
        try {
            const response = await this.callOpenRouter(
                'anthropic/claude-3-haiku',
                'You are a game master. Generate a single, engaging discussion topic for a social deduction game. The topic should be something that allows for diverse opinions and creative responses. Return only the topic, nothing else. Examples: "What would you do if you could time travel?", "Describe your ideal vacation", "What superpower would you choose and why?"'
            );
            
            this.currentTopic = response.trim();
            document.getElementById('current-topic').textContent = this.currentTopic;
        } catch (error) {
            console.error('Error generating topic:', error);
            this.currentTopic = "What would you do if you could time travel?";
            document.getElementById('current-topic').textContent = this.currentTopic;
        }
    }

    startTurn() {
        this.currentTurn++;
        this.updateGameInfo();
        this.shuffleTurnOrder();
        this.currentSpeakerIndex = 0;
        this.gamePhase = 'discussion';
        this.displayTurnOrder();
        this.hideVoteResults();
        this.nextSpeaker();
    }

    shuffleTurnOrder() {
        this.turnOrder = [...this.players];
        for (let i = this.turnOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.turnOrder[i], this.turnOrder[j]] = [this.turnOrder[j], this.turnOrder[i]];
        }
    }

    async nextSpeaker() {
        if (this.currentSpeakerIndex >= this.turnOrder.length) {
            this.startVoting();
            return;
        }

        const currentPlayer = this.turnOrder[this.currentSpeakerIndex];
        document.getElementById('speaker-name').textContent = currentPlayer.name;
        this.updateTurnOrderDisplay();
        
        if (currentPlayer.type === 'human') {
            this.showPlayerInput();
        } else {
            this.showTypingIndicator();
            await this.generateBotResponse(currentPlayer);
            this.hideTypingIndicator();
            this.currentSpeakerIndex++;
            setTimeout(() => this.nextSpeaker(), 1000);
        }
    }

    showPlayerInput() {
        document.getElementById('player-input').classList.remove('hidden');
        document.getElementById('message-input').focus();
    }

    hidePlayerInput() {
        document.getElementById('player-input').classList.add('hidden');
        document.getElementById('message-input').value = '';
    }

    showTypingIndicator() {
        document.getElementById('typing-indicator').classList.remove('hidden');
    }

    hideTypingIndicator() {
        document.getElementById('typing-indicator').classList.add('hidden');
    }

    sendPlayerMessage() {
        const message = document.getElementById('message-input').value.trim();
        if (!message) return;

        this.addMessage(this.playerName, message, 'human');
        this.hidePlayerInput();
        this.currentSpeakerIndex++;
        setTimeout(() => this.nextSpeaker(), 500);
    }

    async generateBotResponse(bot) {
        try {
            const chatHistory = this.getChatHistory();
            const prompt = `You are playing a social deduction game where you must blend in with humans. The topic is: "${this.currentTopic}"

Chat history:
${chatHistory}

Respond naturally to the topic as if you were a human. Keep your response conversational, 1-2 sentences, and avoid being too robotic or perfect. Show personality and perhaps a slight quirk or opinion. Don't mention that you're an AI.`;

            const response = await this.callOpenRouter(bot.model, prompt);
            this.addMessage(bot.name, response.trim(), 'bot');
        } catch (error) {
            console.error('Error generating bot response:', error);
            alert(`Error generating response for ${bot.name}: ${error.message}`);
            // Skip this bot's turn and move to next speaker
            return;
        }
    }

    getChatHistory() {
        const messages = document.querySelectorAll('.message');
        return Array.from(messages).map(msg => {
            const name = msg.querySelector('.message-header').textContent.replace(':', '');
            const text = msg.querySelector('.message-text').textContent;
            return `${name}: ${text}`;
        }).join('\n');
    }

    addMessage(name, text, type) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.innerHTML = `
            <div class="message-header">${name}:</div>
            <div class="message-text">${text}</div>
        `;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    startVoting() {
        this.gamePhase = 'voting';
        document.getElementById('voting-section').classList.remove('hidden');
        
        const votingOptions = document.getElementById('voting-options');
        votingOptions.innerHTML = '';
        
        // Only show bot players as voting options (exclude human player)
        this.players.forEach(player => {
            if (player.type !== 'human') {
                const option = document.createElement('div');
                option.className = 'vote-option';
                option.textContent = player.name;
                option.addEventListener('click', () => this.selectVote(player.name));
                votingOptions.appendChild(option);
            }
        });
    }

    selectVote(playerName) {
        document.querySelectorAll('.vote-option').forEach(option => {
            option.classList.remove('selected');
        });
        
        event.target.classList.add('selected');
        this.selectedVote = playerName;
        document.getElementById('submit-vote').disabled = false;
    }

    async submitVote() {
        if (!this.selectedVote) return;
        
        this.votes[this.playerName] = this.selectedVote;
        
        // Hide voting options and show loading status
        document.getElementById('voting-options').style.display = 'none';
        document.getElementById('submit-vote').style.display = 'none';
        this.showVotingStatus();
        
        // Generate bot votes with loading indicators
        const botPlayers = this.players.filter(p => p.type === 'bot');
        
        for (const player of botPlayers) {
            try {
                this.updateBotVotingStatus(player.name, 'voting');
                
                const chatHistory = this.getChatHistory();
                const playerList = this.players.map(p => p.name).join(', ');
                
                const prompt = `You are playing a social deduction game. Based on the conversation, vote for who you think is the human player trying to blend in with AI bots.

Chat history:
${chatHistory}

Players: ${playerList}

Who seems most like a human? Respond with only the player's name.`;

                const response = await this.callOpenRouter(player.model, prompt);
                const votedPlayer = response.trim();
                
                // Validate the vote
                if (this.players.some(p => p.name === votedPlayer)) {
                    this.votes[player.name] = votedPlayer;
                } else {
                    // Random vote if response is invalid
                    const randomPlayer = this.players[Math.floor(Math.random() * this.players.length)];
                    this.votes[player.name] = randomPlayer.name;
                }
                
                this.updateBotVotingStatus(player.name, 'complete');
            } catch (error) {
                console.error('Error generating bot vote:', error);
                alert(`Error generating vote for ${player.name}: ${error.message}`);
                this.updateBotVotingStatus(player.name, 'error');
                // Skip this bot's vote
                continue;
            }
        }
        
        this.processVotes();
    }

    processVotes() {
        const voteCounts = {};
        Object.values(this.votes).forEach(vote => {
            voteCounts[vote] = (voteCounts[vote] || 0) + 1;
        });
        
        const maxVotes = Math.max(...Object.values(voteCounts));
        const winners = Object.keys(voteCounts).filter(name => voteCounts[name] === maxVotes);
        
        // Display vote results
        this.displayVoteResults(voteCounts, winners, maxVotes);
        
        // Check if there's a majority and if they correctly identified the human
        const majorityThreshold = Math.ceil(this.players.length / 2);
        
        if (maxVotes >= majorityThreshold && winners.includes(this.playerName)) {
            this.endGame(false, `The bots correctly identified you as the human! You survived ${this.currentTurn} turns.`);
        } else {
            // Human survives this round or no majority
            this.score = this.currentTurn;
            document.getElementById('voting-section').classList.add('hidden');
        }
    }

    clearChat() {
        document.getElementById('chat-messages').innerHTML = '';
    }

    endGame(won, message) {
        this.gameRunning = false;
        this.showScreen('game-over-screen');
        document.getElementById('final-score').textContent = `Final Score: ${this.score} turns`;
        document.getElementById('game-result').textContent = message;
        this.displayFinalVoteResults();
    }

    async callOpenRouter(model, prompt) {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                max_tokens: 150,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const responseText = await response.text();
            console.error('OpenRouter API Error:', {
                modelId: model,
                status: response.status,
                statusText: response.statusText,
                response: responseText
            });
            throw new Error(`API call failed: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    updateGameInfo() {
        document.getElementById('turn-counter').textContent = `Turn: ${this.currentTurn}`;
        document.getElementById('score').textContent = `Score: ${this.score}`;
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    displayTurnOrder() {
        const turnOrderSection = document.getElementById('turn-order-section');
        const turnOrderList = document.getElementById('turn-order-list');
        
        turnOrderSection.classList.remove('hidden');
        turnOrderList.innerHTML = '';
        
        this.turnOrder.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'turn-order-player';
            const humanIndicator = player.type === 'human' ? ' <span class="human-indicator">(human)</span>' : '';
            playerDiv.innerHTML = `
                <span class="turn-order-number">${index + 1}</span>
                ${player.name}${humanIndicator}
            `;
            turnOrderList.appendChild(playerDiv);
        });
    }

    updateTurnOrderDisplay() {
        const playerDivs = document.querySelectorAll('.turn-order-player');
        playerDivs.forEach((div, index) => {
            div.classList.remove('current', 'completed');
            if (index < this.currentSpeakerIndex) {
                div.classList.add('completed');
            } else if (index === this.currentSpeakerIndex) {
                div.classList.add('current');
            }
        });
    }

    displayVoteResults(voteCounts, winners, maxVotes) {
        const voteResultsSection = document.getElementById('vote-results-section');
        const voteResultsContent = document.getElementById('vote-results-content');
        
        voteResultsSection.classList.remove('hidden');
        
        // Create summary
        const majorityThreshold = Math.ceil(this.players.length / 2);
        const hasWinner = maxVotes >= majorityThreshold;
        const humanDetected = hasWinner && winners.includes(this.playerName);
        
        let summaryHTML = `<div class="vote-summary ${humanDetected ? 'human-detected' : 'human-safe'}">`;
        if (humanDetected) {
            summaryHTML += `<strong>🚨 HUMAN DETECTED!</strong><br>You were identified with ${maxVotes} votes. Game Over!`;
        } else if (hasWinner) {
            summaryHTML += `<strong>✅ You're Safe!</strong><br>${winners[0]} was suspected with ${maxVotes} votes, but they're not the human.`;
        } else {
            summaryHTML += `<strong>🤝 No Majority</strong><br>No clear consensus. You remain undetected!`;
        }
        summaryHTML += '</div>';
        
        // Create detailed vote breakdown
        let detailsHTML = '<h4>Vote Breakdown:</h4>';
        Object.entries(this.votes).forEach(([voter, voted]) => {
            const voterPlayer = this.players.find(p => p.name === voter);
            const votedPlayer = this.players.find(p => p.name === voted);
            
            const voterType = voterPlayer?.type || 'unknown';
            const votedType = votedPlayer?.type || 'unknown';
            
            const voterLabel = voterType === 'human' ? '(You)' : `<span class="model-id">(${voterPlayer?.model || 'Bot'})</span>`;
            const votedLabel = votedType === 'human' ? '(You)' : `<span class="model-id">(${votedPlayer?.model || 'Bot'})</span>`;
            
            detailsHTML += `
                <div class="vote-result-item">
                    <span><strong>${voter}</strong> ${voterLabel}</span>
                    <span>voted for <strong>${voted}</strong> ${votedLabel}</span>
                </div>
            `;
        });
        
        // Vote count summary
        detailsHTML += '<h4 style="margin-top: 15px;">Vote Counts:</h4>';
        Object.entries(voteCounts)
            .sort(([,a], [,b]) => b - a)
            .forEach(([player, count]) => {
                const playerObj = this.players.find(p => p.name === player);
                const playerType = playerObj?.type || 'unknown';
                const playerLabel = playerType === 'human' ? '(You)' : `<span class="model-id">(${playerObj?.model || 'Bot'})</span>`;
                detailsHTML += `
                    <div class="vote-result-item">
                        <span><strong>${player}</strong> ${playerLabel}</span>
                        <span><strong>${count} vote${count !== 1 ? 's' : ''}</strong></span>
                    </div>
                `;
            });
        
        voteResultsContent.innerHTML = summaryHTML + detailsHTML;
    }

    hideVoteResults() {
        document.getElementById('vote-results-section').classList.add('hidden');
    }

    continueToNextTurn() {
        this.clearChat();
        this.hideVoteResults();
        this.votes = {};
        this.startTurn();
    }

    showVotingStatus() {
        document.getElementById('voting-status').classList.remove('hidden');
        const botVotingList = document.getElementById('bot-voting-list');
        botVotingList.innerHTML = '';
        
        const botPlayers = this.players.filter(p => p.type === 'bot');
        botPlayers.forEach(player => {
            const statusDiv = document.createElement('div');
            statusDiv.className = 'bot-voting-status';
            statusDiv.id = `voting-status-${player.name}`;
            statusDiv.innerHTML = `
                <span class="bot-name">${player.name}</span>
                <span class="status-indicator">
                    <div class="voting-loader"></div>
                </span>
            `;
            botVotingList.appendChild(statusDiv);
        });
    }

    updateBotVotingStatus(botName, status) {
        const statusDiv = document.getElementById(`voting-status-${botName}`);
        if (!statusDiv) return;
        
        const statusIndicator = statusDiv.querySelector('.status-indicator');
        if (status === 'voting') {
            statusIndicator.innerHTML = '<div class="voting-loader"></div>';
        } else if (status === 'complete') {
            statusIndicator.innerHTML = '<span class="vote-complete">✓ Voted</span>';
        } else if (status === 'error') {
            statusIndicator.innerHTML = '<span style="color: #f44336;">✗ Error</span>';
        }
    }

    displayFinalVoteResults() {
        const finalVoteDisplay = document.getElementById('final-vote-display');
        
        if (Object.keys(this.votes).length === 0) {
            finalVoteDisplay.innerHTML = '<p>No votes were cast.</p>';
            return;
        }
        
        // Calculate vote counts
        const voteCounts = {};
        Object.values(this.votes).forEach(vote => {
            voteCounts[vote] = (voteCounts[vote] || 0) + 1;
        });
        
        let html = '<h3>Final Vote Results</h3>';
        
        // Vote breakdown
        html += '<h4>Individual Votes:</h4>';
        Object.entries(this.votes).forEach(([voter, voted]) => {
            const voterPlayer = this.players.find(p => p.name === voter);
            const votedPlayer = this.players.find(p => p.name === voted);
            
            const voterType = voterPlayer?.type || 'unknown';
            const votedType = votedPlayer?.type || 'unknown';
            
            const voterLabel = voterType === 'human' ? '(You)' : `<span class="model-id">(${voterPlayer?.model || 'Bot'})</span>`;
            const votedLabel = votedType === 'human' ? '(You)' : `<span class="model-id">(${votedPlayer?.model || 'Bot'})</span>`;
            
            html += `
                <div class="vote-result-item">
                    <span><strong>${voter}</strong> ${voterLabel}</span>
                    <span>voted for <strong>${voted}</strong> ${votedLabel}</span>
                </div>
            `;
        });
        
        // Vote count summary
        html += '<h4 style="margin-top: 20px;">Vote Totals:</h4>';
        Object.entries(voteCounts)
            .sort(([,a], [,b]) => b - a)
            .forEach(([player, count]) => {
                const playerObj = this.players.find(p => p.name === player);
                const playerType = playerObj?.type || 'unknown';
                const playerLabel = playerType === 'human' ? '(You)' : `<span class="model-id">(${playerObj?.model || 'Bot'})</span>`;
                html += `
                    <div class="vote-result-item">
                        <span><strong>${player}</strong> ${playerLabel}</span>
                        <span><strong>${count} vote${count !== 1 ? 's' : ''}</strong></span>
                    </div>
                `;
            });
        
        finalVoteDisplay.innerHTML = html;
    }

    resetGame() {
        this.currentTurn = 0;
        this.score = 0;
        this.players = [];
        this.votes = {};
        this.gameRunning = false;
        this.gamePhase = 'setup';
        this.selectedModels.clear();
        this.setDefaultModels();
        this.clearChat();
        document.getElementById('voting-section').classList.add('hidden');
        document.getElementById('voting-status').classList.add('hidden');
        document.getElementById('turn-order-section').classList.add('hidden');
        this.hideVoteResults();
        this.hidePlayerInput();
        // Reset voting options display
        document.getElementById('voting-options').style.display = 'block';
        document.getElementById('submit-vote').style.display = 'block';
        this.showScreen('setup-screen');
    }
}

// Initialize the game when the page loads
window.addEventListener('DOMContentLoaded', () => {
    window.game = new HumanSpyGame();
});