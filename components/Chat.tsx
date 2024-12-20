/* eslint-disable @next/next/no-img-element */
import React, { SetStateAction, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Message } from "@farcaster/core";
import { ExternalEd25519Signer } from '@standard-crypto/farcaster-js-hub-rest';

// Gundb for team logos within d33m rooms
import Gun from 'gun';
import 'gun/lib/radix';
import 'gun/lib/radisk';
import 'gun/lib/store';
import 'gun/lib/rindexed';

// Hooks
import { useFetchCastsParentUrl } from './useFetchCastsParentUrl';
import { useCommands } from './slashCommands';
import { useFarcasterSigner, usePrivy } from '@privy-io/react-auth';

// Utilities
import fetchCastersDetails from './fetchCasterDetails';
import submitCastPrivy from './sendCastPrivy';
import sendTip from './sendTip';
import sendAI from './sendAI';

// Constants
import { DefaultChannelDomain, FarcasterHub, DefaultChannelName, CastLengthLimit, GunPeers } from '../constants/constants';
import { customEmojis } from '../constants/customEmojis';

// Components
import SlideOutPanel from '../components/SlideOutPanel';
import SlideOutPanelRight from './SlideOutPanelRight';
import CastItem from './CastItem';
import FooterNav from './FooterNav';
import Header from './Header';
import CommandDropdown from './CommandDropdown';
import CustomTextArea from './UserInput';
import WalletModal from './WalletSetup';
import TeamsModal from './TeamLogos';
import { getRoomName } from '../utility/helper';

// Interfaces
interface UpdatedCast extends Message {
  fname: string;
  pfp: string;
  teamLogo: string;
}

const SocialMediaFeed = () => {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* GET PARAMS FROM URL */
  const { query } = router;

  let channelId: number|string = DefaultChannelName;
  /* QUERY Channel ID --> checking if params exist in the URL */
  /* TODO: REMOVE THIS and use dynamic routes. 404 redirects PITA */
  if (query.channel) {
    channelId = query.channel as string;
  } 
  const targetThis = DefaultChannelDomain+channelId;
  let scrollRef = useRef<HTMLDivElement>(null); 
  scrollRef = useRef(null);

  const [hubAddress] = useState(FarcasterHub); 
  const [newPost, setNewPost] = useState("");
  const [targetUrl, setTargetUrl] = useState(targetThis);
  const {casts, loading} = useFetchCastsParentUrl(targetUrl, hubAddress);
  const [updatedCasts, setUpdatedCasts] = useState<UpdatedCast[]>([]);
  const [remainingChars, setRemainingChars] = useState(CastLengthLimit);
  const [scrollPosition, setScrollPosition] = useState(0); // Store the scroll position
  const [showDropdown, setShowDropdown] = useState(false);
  const {commands, setCommands, filteredCommands, setFilteredCommands} = useCommands();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isPanelRightOpen, setIsPanelRightOpen] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isWalletModalVisible, setIsWalletModalVisible] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState('');
  const { ready, authenticated, user, logout, sendTransaction } = usePrivy();
  const {getFarcasterSignerPublicKey, signFarcasterMessage} = useFarcasterSigner();
  const privySigner = new ExternalEd25519Signer(signFarcasterMessage, getFarcasterSignerPublicKey);
  const [showEmojis, setShowEmojis] = useState(false);
  

  const openPanel = () => {
    setIsPanelOpen(true);
    setShowDropdown(false);
  };

  const closePanel = () => {
    setIsPanelOpen(false);
  };

  const openPanelRight = () => {
    setIsPanelRightOpen(true);
    setShowDropdown(false);
  };
  const closePanelRight = () => {
    setIsPanelRightOpen(false);
  };

  const handleTeamSelect = (teamName: SetStateAction<string>) => {
    setSelectedTeam(teamName);
      // Save data to GunDB
      const peers = GunPeers; 
      const gun = Gun({
        peers: peers,
        localStorage: false, // Enable localStorage
        radisk: true, // Use Radisk to persist data
      });      
      const parsedUrl = targetUrl.replace('https://', '');
        // Check if user and user.farcaster and user.farcaster.fid exist before proceeding
      if (!user?.farcaster?.fid) {
        const errorMessage = 'Something went wrong. Farcaster FID is missing';
        console.error(errorMessage);
        notify(errorMessage);
        return;
      }
      gun.get(parsedUrl).get(user.farcaster.fid.toString()).put({ message: teamName } as never);
      console.log('Saved data to GunDB: ', user.farcaster.fid ,teamName);
  };

  useEffect(() => {
    /*  Scroll to the bottom when casts change or new post is added ??
        This is a hacky solution to scroll to the bottom. Need to revisit this.
    */
    if (scrollRef.current) {
      if (scrollRef.current.scrollHeight > scrollRef.current.clientHeight) {
        if (scrollRef.current.scrollTop === scrollPosition) {
          // Restore the scroll position if it matches the stored position
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      } else {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [scrollPosition, updatedCasts]);

  useEffect(() => {
    fetchCastersDetails(casts, hubAddress, setUpdatedCasts);
  }, [casts, hubAddress]);

  // Adjust textarea height on window resize
  useEffect(() => {
    window.addEventListener('resize', adjustTextareaHeight);
    return () => {
      window.removeEventListener('resize', adjustTextareaHeight);
    };
  }, [newPost]);
     
  useEffect(() => {
    adjustTextareaHeight();
  }, [newPost]); 
  
  useEffect(() => {
    if (!showEmojis && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [showEmojis]);

  // FUNCTIONS
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };    
  
  const handlePostChange = async (event: { target: { value: any; }; }) => {
    const inputValue = event.target.value;
    setNewPost(inputValue);
    const count = CastLengthLimit - inputValue.length; // TODO jut guessing here
    setRemainingChars(count);
    adjustTextareaHeight();

    if (inputValue.startsWith('/')) {
      const searchTerm = inputValue.slice(1).toLowerCase();
      const matchedCommands = commands.filter(cmd => 
        cmd.command.toLowerCase().startsWith(searchTerm)
      )
      setFilteredCommands(matchedCommands);
      setShowDropdown(matchedCommands.length > 0);

    } else {
      setShowDropdown(false);
    }

    // Check if the input starts with a command followed by parameters
    const commandMatch = inputValue.match(/^\/(\w+)\s*(.*)$/);
    if (commandMatch) {
      const command = commandMatch[1];
      const parameters = commandMatch[2];
      // TOD read from slashCommands.ts, consolidate this functionality into one place
      switch (command) {
        case 'join':
          // Check if parameters are either a 6-character string or a valid URL
          const joinMatch = parameters.match(/^(\w{6})$/) || parameters.match(/^https:\/\/\S+$/);
          if (joinMatch) {
            // If it's a 6-character string, set targetUrl as DefaultChannelDomain + sixCharacterString
            if (joinMatch[1] && joinMatch[1].length === 6) {
              const sixCharacterString = joinMatch[1];
              setTargetUrl(DefaultChannelDomain + sixCharacterString);
              setNewPost(""); // Clear the message
              setRemainingChars(CastLengthLimit);
            }
            // If it's a valid URL, set targetUrl as the provided URL
            else if (joinMatch[0]) {
              setTargetUrl(joinMatch[0]);
              setRemainingChars(CastLengthLimit-joinMatch[0].length+1);
            }
          }
          break;
  
        case 'football':
          // Check if the parameters match the expected length for /football
          setTargetUrl("chain://eip155:1/erc721:0x7abfe142031532e1ad0e46f971cc0ef7cf4b98b0");
          setShowDropdown(false);
          setNewPost(""); // Clear the message
          setRemainingChars(CastLengthLimit);
          break;

        case 'ai':
            setShowDropdown(false);
            break;
        
        case 'tip':
            setShowDropdown(false);
            sendTip(newPost, setNewPost, setRemainingChars, ready, user?.wallet?.address, sendTransaction, notify);
            break;    

        default:
          // Handle unrecognized commands or provide a default action
          //console.log("Unrecognized command:", command);
          break;
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-darkPurple">
        <img
          src="/assets/defifa_spinner.gif"
          alt="Loading spinner"
        />
      </div>
    );
  }

  const predefinedEmojis: never[] = [];
  const customEmojiKeys = Object.keys(customEmojis);
  const emojis = [...predefinedEmojis, ...customEmojiKeys];

  const replaceEmojiId = (emoji: string) => {
    const match = emoji.match(/:(\d+):/);
    if (match) {
      const id = `:${match[1]}:`; // Construct the full key, e.g., :12:
      if (customEmojis[id]) {
        return <span dangerouslySetInnerHTML={{ __html: customEmojis[id] }} />;
      }
    }
    return emoji;
  };

  const processEmoji = (emoji: string) => {
    const replaced = replaceEmojiId(emoji);
    return typeof replaced === 'string'
      ? replaced
      : replaced;
  };

  const addEmoji = (emoji: string) => {
    setNewPost(prevPost => {
      const newPost = prevPost + emoji;
      setRemainingChars(CastLengthLimit - newPost.length);
      return newPost;
    });
    
    // Focus on the textarea after adding the emoji
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };
  
  const toggleShowEmojis = () => {
    setShowEmojis(prevState => !prevState);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 100);
  };

  const roomName = getRoomName(targetUrl);

  
  const notify = (message: string | number | boolean | null | undefined) => toast(message);
  
  // TODO make some better components for this and use them in the panel
  // TODO slide out panel only closing on affordnace click, should close on click outside
  return (
    <>  
      <div className="flex flex-grow flex-col min-h-screen"> {/* FULL SCREEN */}
        {/* HEADER & BODY */}
        <div className="flex-grow bg-darkPurple overflow-hidden"> {/* Apply overflow-hidden here */}
          {/* HEADER */}
          <Header 
            isConnected={ready}
            openPanel={openPanel} 
            targetUrl={targetUrl} 
            onWalletClick={() => {
              setIsWalletModalVisible(true);
              setShowDropdown(false);
            }}
          />
          {/* BODY */}
          <div ref={scrollRef} className="flex-grow overflow-y-auto max-h-[calc(100vh-235px)]"> {/* Apply max height here */}
            {updatedCasts?.map((updatedCast, index) => {
              return (
                <CastItem key={index} updatedCast={updatedCast} index={index} room={targetUrl} />
              );
            })}
          </div>
        </div>
        {/* FOOTER */}  
        <div className="bg-purplePanel p-4 relative z-10"> 
          <div className="flex items-end space-x-2 relative z-10">
            {/* FOOTER PANEL SLIDE OUT ?? */}  
            <div className="relative flex-1"> {/* Adjust flex container */}
              {isPanelOpen && (
                <SlideOutPanel 
                  isOpen={isPanelOpen} 
                  onClose={closePanel} 
                  setNewPost={setNewPost}
                  handlePostChange={handlePostChange}
                  
                /> 
              )}
              {isModalVisible && (
                <TeamsModal 
                  isOpen={isModalVisible} 
                  onRequestClose={() => setIsModalVisible(false)}
                  onTeamSelect={handleTeamSelect}
                  
                /> 
              )}{isPanelRightOpen && (
                <SlideOutPanelRight
                  isOpen={isPanelRightOpen} 
                  onClose={closePanelRight} 
                /> 
              )}{isWalletModalVisible && (
                <WalletModal 
                  isOpen={isWalletModalVisible} 
                  onRequestClose={() => setIsWalletModalVisible(false)}
                  
                /> 
              )}
              {showDropdown && (
                <CommandDropdown 
                  filteredCommands={filteredCommands}
                  setShowDropdown={setShowDropdown}
                  setNewPost={setNewPost}
                  handlePostChange={handlePostChange}
                  textareaRef={textareaRef} 
                  
                />
              )}
              {/* UserInput */}  
              <CustomTextArea
                textareaRef={textareaRef}
                newPost={newPost}
                showDropdown={showDropdown}
                setNewPost={setNewPost}
                handlePostChange={handlePostChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const aiPost = /^\/ai\s/; 
                    const tipPost = /^\/tip/;
                    if (aiPost.test(newPost)) {
                      sendAI(newPost, setNewPost, setRemainingChars, targetUrl, selectedTeam);
                      return;
                    }
                    if (tipPost.test(newPost)) {
                      if(ready && user?.wallet?.address) {
                        sendTip(newPost, setNewPost, setRemainingChars, ready, user?.wallet?.address, sendTransaction, notify);
                        return;
                      }
                      return;
                    }
                    if (ready && authenticated && user?.farcaster?.fid) {
                      console.log('fid is ', user?.farcaster?.fid)
                      const fid = user?.farcaster?.fid;
                      if (fid) {
                        submitCastPrivy(fid, newPost, targetUrl, privySigner);
                        setNewPost("");
                        setRemainingChars(CastLengthLimit);
                      } else {
                        console.error("User not authenticated.");
                        setNewPost("");
                        setRemainingChars(CastLengthLimit);
                        notify("Authenticate your Account to chat.");
                        setIsWalletModalVisible(true);
                        setShowDropdown(false); 
                      }
                    } else {
                      console.error("User not authenticated.");
                      setNewPost("");
                      setRemainingChars(CastLengthLimit);
                      notify("Authenticate your Account to chat.");
                      setIsWalletModalVisible(true);
                      setShowDropdown(false); 
                    }
                  }
                  else if (e.key === 'Tab' && showDropdown && filteredCommands.length > 0) {
                    e.preventDefault(); // Prevent losing focus from the textarea
                    const firstCommand = filteredCommands[0].command;
                    setNewPost(`/${firstCommand}`);
                    setShowDropdown(false); 
                  }
                }}
              />
            </div>
            <button
              className="mb-2 py-2 px-2 bg-deepPink hover:bg-pink-600 rounded-full flex items-center justify-center transition duration-300 ease-in-out shadow-md hover:shadow-lg text-lightPurple font-semibold text-medium z-1"
              onClick={() => {
                const aiPost = /^\/ai\s/; 
                const tipPost = /^\/tip\s/;
                if (aiPost.test(newPost)) {
                  sendAI(newPost, setNewPost, setRemainingChars, targetUrl, selectedTeam);
                  return;
                }
                if (tipPost.test(newPost)) {
                  if(ready && user?.wallet?.address) {
                    sendTip(newPost, setNewPost, setRemainingChars, ready, user?.wallet?.address, sendTransaction, notify);
                    return;
                  }
                  return;
                }
                if (ready && authenticated && user?.farcaster?.fid) {
                  const fid = user?.farcaster?.fid;
                  if (fid) {
                    submitCastPrivy(fid, newPost, targetUrl, privySigner);
                    setNewPost("");
                    setRemainingChars(CastLengthLimit);
                  }
                  else {
                    console.error("User not authenticated.");
                    setNewPost("");
                    setRemainingChars(CastLengthLimit);
                    notify("Authenticate your Account to chat.");
                    setIsWalletModalVisible(true);
                    setShowDropdown(false); 
                  }
                } else {
                    console.error("User not authenticated.");
                    setNewPost("");
                    setRemainingChars(CastLengthLimit);
                    notify("Authenticate your Account to chat.");
                    setIsWalletModalVisible(true);
                    setShowDropdown(false); 
                  }
              }}>
              <ToastContainer
                position="top-center"
                autoClose={2000}
                pauseOnFocusLoss={false}
                hideProgressBar={true}
                className="custom-toast-container" // Apply the custom class
                />
              <img src="/favicon.ico" alt="Favicon" className="w-6 h-5" />
            </button>
          </div>
          <div className="flex items-center space-x-2 mt-1 relative z-0">
            {/* Reactions Button and Emojis */}
            <div className="relative z-0">
              <button
                className="py-2 px-2 bg-deepPink hover:bg-pink-600 rounded-full flex items-center justify-center transition duration-300 ease-in-out shadow-md hover:shadow-lg text-lightPurple font-semibold text-medium"
                onClick={toggleShowEmojis}
                >
                <p className="text-xxs ml-2" style={{ color: '#C0B2F0' }}>\o/ Reactions</p>
              </button>
              {showEmojis && (
                <div className="absolute top-0 left-full ml-2 flex space-x-1 z-0">
                  {emojis.map((emoji, index) => {
                    const processedEmoji = replaceEmojiId(emoji);
                    return (
                      <button
                        key={index}
                        onClick={() => addEmoji(emoji)}
                        className="w-10 h-6 bg-purplePanel hover:bg-darkPurple rounded-full p-2 transition duration-300 ease-in-out shadow-md hover:shadow-lg text-white"
                      >
                        {processEmoji(emoji)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <p className="text-fontRed ml-2 text-sm mt-1 mb-1 relative z-0">{remainingChars} characters remaining ish</p>
          {/* FOOTER NAV */}  
          <FooterNav 
            onLobbyClick={() => {
              if (!isPanelOpen) {
                openPanel();
              } else {
                closePanel();
              }
            } }
            onBadgeClick={() => {
              setIsModalVisible(true);
              setShowDropdown(false);
            } }
            onFrameClick={() => {
              console.log("Table click");
              if (!isPanelRightOpen) {
                openPanelRight();
              } else {
                closePanelRight();
              }
            } }
            isGantry={roomName==='gantry'}
            onAIClick={() => sendAI("/ai Summarize the match data. Do not exceed 320 characters when replying. Start every reply prefixed with [AI]", setNewPost, setRemainingChars, targetUrl, selectedTeam)}
            onWalletClick={function (): void {
              throw new Error('Function not implemented.');
            } } 
             />
        </div>
      </div>
    </>
  )
  
}
export default SocialMediaFeed
