package app.affine.pro.ai.chat

import androidx.lifecycle.ViewModel
import app.affine.pro.repo.NetworkRepo
import app.affine.pro.repo.WebRepo
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val webRepo: WebRepo,
    private val networkRepo: NetworkRepo,
) : ViewModel() {

}