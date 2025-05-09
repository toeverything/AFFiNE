//
//  Prompt.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/12/26.
//

import Foundation

enum Prompt: String {
  #if DEBUG
    case debug_action_dalle3 = "debug:action:dalle3"
    case debug_action_fal_sd15 = "debug:action:fal-sd15"
    case debug_action_fal_upscaler = "debug:action:fal-upscaler"
    case debug_action_fal_remove_bg = "debug:action:fal-remove-bg"
    case debug_action_fal_face_to_sticker = "debug:action:fal-face-to-sticker"
  #endif

  case general_Chat_With_AFFiNE_AI = "Chat With AFFiNE AI"
  case general_Summary = "Summary"
  case general_Generate_a_caption = "Generate a caption"
  case general_Summary_the_webpage = "Summary the webpage"
  case general_Explain_this = "Explain this"
  case general_Explain_this_image = "Explain this image"
  case general_Explain_this_code = "Explain this code"
  case general_Translate_to = "Translate to"
  case general_Write_an_article_about_this = "Write an article about this"
  case general_Write_a_twitter_about_this = "Write a twitter about this"
  case general_Write_a_poem_about_this = "Write a poem about this"
  case general_Write_a_blog_post_about_this = "Write a blog post about this"
  case general_Write_outline = "Write outline"
  case general_Change_tone_to = "Change tone to"
  case general_Brainstorm_ideas_about_this = "Brainstorm ideas about this"
  case general_Expand_mind_map = "Expand mind map"
  case general_Improve_writing_for_it = "Improve writing for it"
  case general_Improve_grammar_for_it = "Improve grammar for it"
  case general_Fix_spelling_for_it = "Fix spelling for it"
  case general_Find_action_items_from_it = "Find action items from it"
  case general_Check_code_error = "Check code error"
  case general_Create_headings = "Create headings"
  case general_Make_it_real = "Make it real"
  case general_Make_it_real_with_text = "Make it real with text"
  case general_Make_it_longer = "Make it longer"
  case general_Make_it_shorter = "Make it shorter"
  case general_Continue_writing = "Continue writing"

  case workflow_presentation = "workflow:presentation"
  case workflow_brainstorm = "workflow:brainstorm"
  case workflow_image_sketch = "workflow:image-sketch"
  case workflow_image_clay = "workflow:image-clay"
  case workflow_image_anime = "workflow:image-anime"
  case workflow_image_pixel = "workflow:image-pixel"
}
